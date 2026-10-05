/* ============================================================
   그날의 공원 — 날짜 · 날씨 · 운영시간 · 티켓 시즌 등급.
   전부 에버랜드 공식 API 에서 서버가 가져온다 (30분 캐시).

     GET /api/v1/iam/information/resorts/weathers      9일치 날씨
     GET /api/v1/iam/facilities/parkOpenTime?...       그날 개폐 시각 + 시즌 등급
   ============================================================ */

import { getKmaWeather, hasKmaKey } from "./weather-kma";

const BASE = "https://wwwapi.everland.com/api/v1/iam";

/* 지역팩마다 날씨를 재는 좌표. 기상청 격자는 5km 단위라 공원 중심 한 점이면 충분하다. */
const COORD: Record<string, { lat: number; lng: number }> = {
  everland: { lat: 37.2936, lng: 127.2022 },
  gyeongju: { lat: 35.8347, lng: 129.2190 },
};
const TTL_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 10_000;

/* 날씨 코드표는 공개돼 있지 않다. 공식 화면과 대조해 확인한 것만 적는다.
   확인 안 된 코드는 라벨 없이 기온만 보여 준다 — 지어내지 않는다. */
const WEATHER: Record<string, { label: string; icon: string }> = {
  "03": { label: "흐림", icon: "☁️" },   // 2026-10-02 공식 메인에서 21.7°C·흐림 으로 확인
};

export interface Weather {
  code: string;
  label: string | null;     // 확인된 코드만 채운다
  icon: string;
  temp: string;             // 오늘은 "21.7", 미래는 "8/23" (최저/최고)
  low: number | null;
  high: number | null;
  isToday: boolean;
  from: "kma" | "everland"; // 어디서 온 값인가
  note?: string;            // 격자·발표시각 같은 근거
}

export interface ParkDay {
  date: string;             // YYYY-MM-DD
  weekday: string;          // 금요일
  weather: Weather | null;
  hours: { open: string; close: string } | null;
  seasonGrade: string | null;   // A · B · C · D — 종일권 가격이 갈리는 시즌
  fetchedAt: string;
  source: string;
  error?: string;
}

const WD = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

const g = globalThis as unknown as { __parkday?: Map<string, { at: number; data: ParkDay }> };
const cache = g.__parkday ?? (g.__parkday = new Map());

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "family-trip-planner/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function parseTemp(t: string): { low: number | null; high: number | null } {
  const m = t.split("/").map((x) => Number(x.trim()));
  if (m.length === 2 && m.every(Number.isFinite)) return { low: m[0], high: m[1] };
  return { low: null, high: null };
}

export async function getParkDay(date: string, region = "everland"): Promise<ParkDay> {
  const key = `${region}:${date}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const ymd = date.replace(/-/g, "");
  const weekday = WD[new Date(`${date}T00:00:00`).getDay()] ?? "";
  const base: ParkDay = {
    date, weekday, weather: null, hours: null, seasonGrade: null,
    fetchedAt: new Date().toISOString(),
    source: "에버랜드 공식 API (날씨 · 운영시간 · 시즌 등급)",
  };

  /* 1순위: 공공데이터포털 기상청 단기예보.
     코드 의미가 공개돼 있어 라벨을 믿고 쓸 수 있다. 키가 없거나 예보 범위 밖이면 2순위로 넘어간다. */
  const c = COORD[region];
  if (hasKmaKey() && c) {
    try {
      const k = await getKmaWeather(c.lat, c.lng, date);
      if (k) {
        const today = new Date().toISOString().slice(0, 10) === date;
        base.weather = {
          code: `SKY${k.sky ?? "-"}/PTY${k.pty ?? "-"}`,
          label: k.label || null,
          icon: k.icon,
          temp: today && k.temp != null ? String(k.temp)
              : k.low != null && k.high != null ? `${k.low}/${k.high}` : "",
          low: k.low, high: k.high,
          isToday: today,
          from: "kma",
          note: `기상청 ${k.baseTime} 발표 · 격자 ${k.grid.nx},${k.grid.ny}`,
        };
        base.source = k.source;
      }
    } catch (e) {
      base.error = `기상청 API: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  try {
    const [w, p] = await Promise.allSettled([
      json<{ day: number; wcode: string; temp: string; date: string }[]>(
        `${BASE}/information/resorts/weathers`),
      json<{ openTime?: string; closeTime?: string; gradeTypeCd?: string }[]>(
        `${BASE}/facilities/parkOpenTime?salesDate=${ymd}&parkKindCd=01`),
    ]);

    if (w.status === "fulfilled" && !base.weather) {   /* 기상청에서 못 받았을 때만 */
      const row = w.value.find((x) => x.date === ymd);
      if (row) {
        const known = WEATHER[row.wcode];
        base.weather = {
          code: row.wcode,
          label: known?.label ?? null,
          icon: known?.icon ?? "🌤",
          temp: row.temp,
          ...parseTemp(row.temp),
          isToday: row.day === 0,
          from: "everland",
          note: "에버랜드 자체 날씨 — 코드 의미가 공개되지 않아 확인된 것만 라벨을 답니다",
        };
      }
    }
    if (p.status === "fulfilled" && p.value[0]) {
      const r = p.value[0];
      if (r.openTime && r.closeTime) base.hours = { open: r.openTime, close: r.closeTime };
      base.seasonGrade = r.gradeTypeCd ?? null;
    }
    if (!base.weather && !base.hours) {
      base.error = "공식 API 에서 그날 정보를 받지 못했습니다.";
    }
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
  }

  cache.set(key, { at: Date.now(), data: base });
  return base;
}
