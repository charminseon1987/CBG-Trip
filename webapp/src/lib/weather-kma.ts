/* ============================================================
   날씨 — 공공데이터포털 기상청 단기예보 조회서비스

     https://www.data.go.kr/data/15084084/openapi.do
     · 초단기실황 getUltraSrtNcst  — 지금 기온·하늘상태 (매시 40분 이후)
     · 단기예보   getVilageFcst    — 3일치 최저/최고·하늘상태

   서비스키가 필요하다. 발급받아 .env.local 에 넣는다.
     DATA_GO_KR_KEY=발급받은키

   키가 없으면 이 모듈은 null 을 돌려주고, 호출한 쪽이 에버랜드 공식 API 로 넘어간다.
   ============================================================ */

const BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
const TIMEOUT_MS = 10_000;

/* 기상청 격자 변환 (Lambert Conformal Conic).
   기상청이 배포하는 공식 파라미터 그대로다. */
const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0;
const XO = 43, YO = 136;

export function toGrid(lat: number, lng: number): { nx: number; ny: number } {
  const D = Math.PI / 180;
  const re = RE / GRID;
  const slat1 = SLAT1 * D, slat2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * D - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

/* 기상청 하늘상태(SKY)·강수형태(PTY) 코드 — 공식 문서에 정의된 값이다.
   에버랜드 자체 코드와 달리 여기는 의미가 공개돼 있어 그대로 쓸 수 있다. */
const SKY: Record<string, { label: string; icon: string }> = {
  "1": { label: "맑음", icon: "☀️" },
  "3": { label: "구름많음", icon: "⛅" },
  "4": { label: "흐림", icon: "☁️" },
};
const PTY: Record<string, { label: string; icon: string }> = {
  "0": { label: "", icon: "" },
  "1": { label: "비", icon: "🌧" },
  "2": { label: "비/눈", icon: "🌨" },
  "3": { label: "눈", icon: "❄️" },
  "4": { label: "소나기", icon: "🌦" },
  "5": { label: "빗방울", icon: "🌧" },
  "6": { label: "빗방울/눈날림", icon: "🌨" },
  "7": { label: "눈날림", icon: "❄️" },
};

export interface KmaWeather {
  label: string;
  icon: string;
  temp: number | null;     // 실황 기온
  low: number | null;      // 예보 최저
  high: number | null;     // 예보 최고
  sky: string | null;
  pty: string | null;
  baseTime: string;        // 어느 발표를 썼는지
  source: string;
  grid: { nx: number; ny: number };
}

export const hasKmaKey = () => Boolean(process.env.DATA_GO_KR_KEY);

interface Item { category: string; fcstDate?: string; fcstTime?: string; fcstValue?: string; obsrValue?: string }

async function call(path: string, params: Record<string, string>): Promise<Item[]> {
  const key = process.env.DATA_GO_KR_KEY!;
  // 서비스키는 이미 URL 인코딩된 형태로 발급되기도 한다. 두 번 인코딩하지 않는다.
  const qs = new URLSearchParams({ ...params, dataType: "JSON", numOfRows: "1000", pageNo: "1" });
  const url = `${BASE}/${path}?serviceKey=${key}&${qs.toString()}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // 키가 잘못되면 XML 로 에러를 준다 — JSON 파싱 전에 걸러 낸다
  if (text.trim().startsWith("<")) {
    const m = text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/) ?? text.match(/<errMsg>(.*?)<\/errMsg>/);
    throw new Error(`기상청 API 오류: ${m?.[1] ?? "XML 응답"}`);
  }
  const body = JSON.parse(text) as {
    response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: Item[] } } };
  };
  const h = body.response?.header;
  if (h?.resultCode && h.resultCode !== "00") throw new Error(`기상청 API: ${h.resultMsg ?? h.resultCode}`);
  return body.response?.body?.items?.item ?? [];
}

/** 초단기실황은 매시 40분에 발표된다. 그 전이면 한 시간 전 발표를 쓴다. */
function ncstBase(now: Date) {
  const d = new Date(now);
  if (d.getMinutes() < 45) d.setHours(d.getHours() - 1);
  return { base_date: ymd(d), base_time: `${String(d.getHours()).padStart(2, "0")}00` };
}
/** 단기예보는 02·05·08·11·14·17·20·23시에 발표된다. */
function fcstBase(now: Date) {
  const SLOTS = [2, 5, 8, 11, 14, 17, 20, 23];
  const d = new Date(now);
  d.setMinutes(d.getMinutes() - 15);          // 발표 직후 여유
  let h = SLOTS.filter((x) => x <= d.getHours()).pop();
  if (h == null) { d.setDate(d.getDate() - 1); h = 23; }
  return { base_date: ymd(d), base_time: `${String(h).padStart(2, "0")}00` };
}
const ymd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/**
 * 그 좌표·그 날짜의 날씨. 키가 없으면 null.
 * 단기예보는 발표 시각 기준 3일치만 제공한다 — 그 밖의 날짜는 null 을 돌려준다.
 */
export async function getKmaWeather(
  lat: number, lng: number, date: string,
): Promise<KmaWeather | null> {
  if (!hasKmaKey()) return null;
  const grid = toGrid(lat, lng);
  const now = new Date();
  const target = date.replace(/-/g, "");
  const isToday = target === ymd(now);

  const common = { nx: String(grid.nx), ny: String(grid.ny) };
  const out: KmaWeather = {
    label: "", icon: "🌤", temp: null, low: null, high: null,
    sky: null, pty: null, baseTime: "",
    source: "공공데이터포털 · 기상청 단기예보 조회서비스",
    grid,
  };

  /* 오늘이면 실황으로 지금 기온을 얻는다 */
  if (isToday) {
    const b = ncstBase(now);
    const items = await call("getUltraSrtNcst", { ...common, ...b });
    const pick = (c: string) => items.find((i) => i.category === c)?.obsrValue;
    const t = Number(pick("T1H"));
    if (Number.isFinite(t)) out.temp = t;
    out.pty = pick("PTY") ?? null;
    out.baseTime = `${b.base_date} ${b.base_time}`;
  }

  /* 예보로 최저·최고와 하늘상태를 얻는다 */
  const fb = fcstBase(now);
  const items = await call("getVilageFcst", { ...common, ...fb });
  const ofDay = items.filter((i) => i.fcstDate === target);
  if (!ofDay.length && !isToday) return null;            // 예보 범위 밖

  const num = (c: string) => {
    const v = ofDay.find((i) => i.category === c)?.fcstValue;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  out.low = num("TMN");
  out.high = num("TMX");

  // 낮 시간대(12시 부근) 하늘상태를 그날 대표값으로 삼는다
  const noon = ofDay.filter((i) => i.fcstTime === "1200");
  const sky = (noon.find((i) => i.category === "SKY") ?? ofDay.find((i) => i.category === "SKY"))?.fcstValue;
  const pty = (noon.find((i) => i.category === "PTY") ?? ofDay.find((i) => i.category === "PTY"))?.fcstValue;
  out.sky = sky ?? null;
  if (!out.pty) out.pty = pty ?? null;

  const rain = out.pty && out.pty !== "0" ? PTY[out.pty] : null;
  const clear = out.sky ? SKY[out.sky] : null;
  out.label = rain?.label || clear?.label || "";
  out.icon = rain?.icon || clear?.icon || "🌤";
  if (!out.baseTime) out.baseTime = `${fb.base_date} ${fb.base_time}`;

  return out;
}
