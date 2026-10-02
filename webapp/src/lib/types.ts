/** 지역팩 · 여행 · 일정의 공통 타입. 지역팩 JSON은 이 모양으로 구워진다. */

export type StopKind =
  | "gate" | "exit" | "animal" | "ride" | "wet" | "food" | "lift" | "solo" | "show"
  | "see" | "play" | "rest" | "move" | "photo" | "stay";

export interface Stop {
  id: string;
  name: string;
  zone: string;
  zl: string;
  lat: number;
  lng: number;
  x: number;
  y: number;
  node: number;
  open: string;          // "0900" · 빈 문자열이면 제약 없음
  close: string;
  hmin: number;          // 탑승 키 제한 (cm) · 0이면 없음
  hmax: number;
  wait: number | null;   // 평균 대기(분)
  kind: StopKind;
  stay?: number;         // 머무는 시간을 장소가 직접 들고 있으면 우선한다
  rank?: number;         // 3 필수 · 2 추천 · 1 여유
  note: string;
}

export interface Zone {
  id: string;
  name: string;
  color: string;
}

export interface RegionPack {
  key: string;
  title: string;
  mode: "walk" | "drive";
  speed: number;                 // m/분
  vw: number;
  vh: number;
  mPerPx: number;
  origin: {
    x0: number; y0: number; scale: number;
    lat0: number; lng0: number; mlat: number; mlng: number;
  };
  base: string;                  // 지도 바탕 SVG 조각
  nodes: [number, number][];
  edges: [number, number][];
  zones: Zone[];
  pool: Stop[];
  plan: { id: string; time?: string }[];
  source: string;
}

export interface Trip {
  id: string;
  title: string;
  date: string;                  // YYYY-MM-DD
  end: string;
  place: string;
  people: number;
  theme: string;
  region: string | null;         // 지역팩 키 · 없으면 설계 에이전트가 맡는다
  builtin?: boolean;
  createdAt: string;
}

export interface Itinerary {
  tripId: string;
  items: string[];               // Stop id 순서
  start: string;                 // "09:30"
  busy: boolean;                 // 주말 대기 ×1.5
  cursor: number;
  updatedAt: string;
}

export interface Leg {
  m: number;                     // 실제 길 위 거리(m)
  pts: [number, number][];       // 지도에 그릴 좌표
}

export interface PlanRow {
  id: string;
  stop: Stop;
  at: number;                    // 도착 시각(분)
  end: number;                   // 출발 시각(분)
  stay: number;
  leg: Leg | null;               // 직전 구간
  problem: string | null;
}

export interface ComputedPlan {
  rows: PlanRow[];
  totalM: number;
  moveMin: number;
  endAt: number;
}

export interface PlanDiff {
  dm: number;                    // 거리 변화(m)
  dmove: number;                 // 이동 시간 변화(분)
  dend: number;                  // 종료 시각 변화(분)
  newProblems: string[];
  verdict: "good" | "same" | "bad";
}

/* ---------- 앨범 · 가계부 ---------- */
export interface Photo {
  id: string;
  tripId: string;
  url: string;              // 지금은 외부 URL 또는 data URI. 스토리지를 붙이면 그 키.
  takenAt: string;          // "13:40"
  caption: string;
  place: string | null;     // 그 시각에 있던 일정 블록
}

export type ExpenseCategory = "ticket" | "car" | "food" | "snack" | "gift" | "etc";

export interface Expense {
  id: string;
  tripId: string;
  amount: number;
  category: ExpenseCategory;
  memo: string;
  at: string;               // "13:40"
  place: string | null;
}

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; name: string; color: string }[] = [
  { id: "ticket", name: "입장권·이용권", color: "#E4568B" },
  { id: "car", name: "차량유지비", color: "#E0923F" },
  { id: "food", name: "식비", color: "#6FB23F" },
  { id: "snack", name: "간식·음료", color: "#E8B93F" },
  { id: "gift", name: "기념품", color: "#D9607A" },
  { id: "etc", name: "기타", color: "#8E8295" },
];
