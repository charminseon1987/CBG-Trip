/* ============================================================
   일별 운영정보 — 그날 무엇이 열고 닫는지, 공연은 몇 시인지.

   지역 지도와 달리 이것은 날짜마다 바뀌므로 구워 둘 수 없다.
   서버가 공식 API 를 호출하고 결과를 잠시 캐시한다.
   (게시형 아티팩트와 달리 Next 서버는 외부 호출이 막혀 있지 않다.)

   출처: 에버랜드 공식 일별 운영정보 API
   https://www.everland.com/everland/information/dailypark 가 쓰는 것과 같은 것
   ============================================================ */

const ENDPOINT = "https://wwwapi.everland.com/api/v1/iam/facilities/dailyOper";
const TTL_MS = 30 * 60 * 1000;          // 30분
const TIMEOUT_MS = 12_000;

export type OperStatus = "open" | "preparing" | "closed" | "unknown";

export interface FacilityDay {
  id: string;
  name: string;
  category: string;          // 어트랙션 · 공연 · 레스토랑 · 기프트샵 · 편의시설 · 포토존
  status: OperStatus;
  statusLabel: string;
  open: string | null;       // "11:00"
  close: string | null;      // "18:00"
  showTimes: string[];       // 공연 시각 ["20:30", "21:20"]
  lastOrder: string | null;
  lat: number | null;
  lng: number | null;
}

export interface DayInfo {
  park: string;
  date: string;              // YYYY-MM-DD
  fetchedAt: string;
  source: string;
  total: number;
  counts: Record<string, number>;
  facilities: FacilityDay[];
  stale?: boolean;           // 호출에 실패해 캐시된 옛 값을 쓰는 중
  error?: string;

  /* 에버랜드는 하루 이틀 앞까지만 그날 운영표를 공개한다.
     그 전에는 거의 모든 어트랙션이 "준비중"으로 내려온다 — 휴장이 아니라 미공개다.
     이 구분을 안 하면 "판다월드가 닫았다" 같은 거짓 경고를 낸다. */
  provisional: boolean;      // 아직 확정 공개 전인 날짜인가
  announcedRatio: number;    // 어트랙션 중 상태가 확정된 비율
}

const hhmm = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return /^\d{4}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2)}` : null;
};

const STATUS: Record<string, OperStatus> = {
  OPEN: "open", CLOSED: "closed", 준비중: "preparing", 운영중: "open", 운휴: "closed",
};

interface RawRow {
  faciltId?: string; faciltName?: string; faciltCateKindName?: string;
  operStatusCd?: string; operStatusName?: string;
  openTime?: string; closeTime?: string; lastOrderTime?: string;
  perfrmTimes?: string | null; perfrmStartTime?: string | null;
  latud?: string; lgtud?: string;
}

function normalize(rows: RawRow[], date: string): FacilityDay[] {
  return rows.map((r) => {
    const label = r.operStatusName ?? r.operStatusCd ?? "";
    const times = String(r.perfrmTimes ?? r.perfrmStartTime ?? "")
      .split(/[,/|]/)
      .map((t) => hhmm(t.replace(/\D/g, "")))
      .filter((t): t is string => Boolean(t));
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n !== 0 ? n : null;
    };
    return {
      id: r.faciltId ?? "",
      name: r.faciltName ?? "",
      category: r.faciltCateKindName ?? "기타",
      status: STATUS[label] ?? "unknown",
      statusLabel: label,
      open: hhmm(r.openTime),
      close: hhmm(r.closeTime),
      showTimes: times,
      lastOrder: hhmm(r.lastOrderTime),
      lat: num(r.latud),
      lng: num(r.lgtud),
    };
  }).filter((f) => f.name);
  void date;
}

/* 날짜별 캐시. 서버가 살아 있는 동안만 유지된다. */
const g = globalThis as unknown as { __dayinfo?: Map<string, { at: number; data: DayInfo }> };
const cache = g.__dayinfo ?? (g.__dayinfo = new Map());

/** YYYY-MM-DD → 그날의 운영정보. 실패하면 캐시된 값을, 그것도 없으면 error 를 담아 돌려준다. */
export async function getDayInfo(date: string, force = false): Promise<DayInfo> {
  const key = `everland:${date}`;
  const hit = cache.get(key);
  if (hit && !force && Date.now() - hit.at < TTL_MS) return hit.data;

  const salesDate = date.replace(/-/g, "");
  const url =
    `${ENDPOINT}?salesDate=${salesDate}&parkKindCd=01&faciltCateKindCd=00` +
    `&langCd=ko&currentPage=1&pagePerCount=300`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "family-trip-planner/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { totalCount?: number; openedList?: RawRow[] };
    const facilities = normalize(body.openedList ?? [], date);

    const counts: Record<string, number> = {};
    for (const f of facilities) counts[f.statusLabel || f.status] = (counts[f.statusLabel || f.status] ?? 0) + 1;

    const rides = facilities.filter((f) => f.category.includes("어트랙션"));
    const announced = rides.filter((f) => f.status !== "preparing").length;
    const announcedRatio = rides.length ? announced / rides.length : 1;
    const provisional = rides.length > 5 && announcedRatio < 0.3;

    const data: DayInfo = {
      park: "everland",
      date,
      fetchedAt: new Date().toISOString(),
      source: "에버랜드 공식 일별 운영정보 (www.everland.com/everland/information/dailypark)",
      total: body.totalCount ?? facilities.length,
      counts,
      facilities,
      provisional,
      announcedRatio: Math.round(announcedRatio * 100) / 100,
    };
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (hit) return { ...hit.data, stale: true, error: msg };
    return {
      park: "everland", date, fetchedAt: new Date().toISOString(),
      source: "에버랜드 공식 일별 운영정보", total: 0, counts: {}, facilities: [],
      provisional: false, announcedRatio: 0,
      error: msg,
    };
  }
}

/** 이름으로 찾기 — 일정에 있는 곳이 그날 여는지 확인할 때 */
export function findFacility(info: DayInfo, name: string): FacilityDay | null {
  const q = name.replace(/\s/g, "").toLowerCase();
  const list = info.facilities;
  return (
    list.find((f) => f.name.replace(/\s/g, "").toLowerCase() === q) ??
    list.find((f) => f.name.replace(/\s/g, "").toLowerCase().includes(q)) ??
    list.find((f) => q.includes(f.name.replace(/\s/g, "").toLowerCase().slice(0, 4))) ??
    null
  );
}
