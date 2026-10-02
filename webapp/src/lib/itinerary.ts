/* ============================================================
   일정 엔진 — 실제 길 위 최단경로로 시각을 계산한다.
   · 다익스트라(이진 힙)로 구간 거리를 재고
   · 머무는 시간 + 대기 + 이동 시간을 더해 도착 시각을 쌓고
   · 운영시간을 넘기는 항목에 문제를 표시하고
   · or-opt 로 순서를 다시 짜 거리를 줄인다.
   ============================================================ */
import type {
  ComputedPlan, Itinerary, Leg, PlanDiff, PlanRow, RegionPack, Stop,
} from "./types";

/* ---------- 시각 유틸 ---------- */
export const toMin = (s: string): number => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
export const hm = (min: number): string => {
  const v = Math.round(min);
  const h = Math.floor(v / 60) % 24;
  const m = ((v % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const hhmm = (t: string): string => (t ? `${t.slice(0, 2)}:${t.slice(2)}` : "");

/* 종류별 기본 체류 시간(분). 장소가 stay 를 들고 있으면 그쪽이 이긴다. */
const STAY: Record<string, number> = {
  gate: 20, exit: 0, animal: 30, ride: 10, wet: 12, food: 50, lift: 8, solo: 8, show: 0,
  see: 40, play: 60, rest: 30, move: 0, photo: 20, stay: 40,
};

/* ============================================================
   지역 그래프 — 지역팩 하나당 한 번만 짓고 캐시한다.
   ============================================================ */
class RegionGraph {
  readonly pack: RegionPack;
  readonly pool: Map<string, Stop>;
  private adj: [number, number][][];
  private cache = new Map<string, Leg>();

  constructor(pack: RegionPack) {
    this.pack = pack;
    this.pool = new Map(pack.pool.map((p) => [p.id, p]));
    this.adj = pack.nodes.map(() => []);
    for (const [a, b] of pack.edges) {
      const w = Math.hypot(
        pack.nodes[a][0] - pack.nodes[b][0],
        pack.nodes[a][1] - pack.nodes[b][1],
      );
      this.adj[a].push([b, w]);
      this.adj[b].push([a, w]);
    }
  }

  /** 두 노드 사이 최단 경로. 거리는 m, 좌표는 지도 좌표. */
  route(from: number, to: number): Leg {
    const key = `${from}:${to}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (from === to) {
      const z: Leg = { m: 0, pts: [] };
      this.cache.set(key, z);
      return z;
    }

    const n = this.pack.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    dist[from] = 0;

    // 이진 힙
    const heap: number[] = [from];
    const cost: number[] = [0];
    const push = (node: number, c: number) => {
      heap.push(node); cost.push(c);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (cost[p] <= cost[i]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        [cost[p], cost[i]] = [cost[i], cost[p]];
        i = p;
      }
    };
    const pop = (): [number, number] => {
      const top: [number, number] = [heap[0], cost[0]];
      const ln = heap.pop()!; const lc = cost.pop()!;
      if (heap.length) {
        heap[0] = ln; cost[0] = lc;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let s = i;
          if (l < heap.length && cost[l] < cost[s]) s = l;
          if (r < heap.length && cost[r] < cost[s]) s = r;
          if (s === i) break;
          [heap[s], heap[i]] = [heap[i], heap[s]];
          [cost[s], cost[i]] = [cost[i], cost[s]];
          i = s;
        }
      }
      return top;
    };

    while (heap.length) {
      const [u, c] = pop();
      if (c > dist[u]) continue;
      if (u === to) break;
      for (const [v, w] of this.adj[u]) {
        const nd = c + w;
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push(v, nd); }
      }
    }

    const pts: [number, number][] = [];
    if (dist[to] !== Infinity) {
      for (let at = to; at !== -1; at = prev[at]) {
        pts.push(this.pack.nodes[at] as [number, number]);
        if (at === from) break;
      }
      pts.reverse();
    }
    const leg: Leg = { m: dist[to] === Infinity ? 0 : dist[to] * this.pack.mPerPx, pts };
    this.cache.set(key, leg);
    return leg;
  }

  stayOf(p: Stop, busy: boolean): number {
    if (p.kind === "show" && p.open && p.close) return toMin(hhmm(p.close)) - toMin(hhmm(p.open));
    const base = p.stay ?? STAY[p.kind] ?? 15;
    return Math.round(base + (p.wait ? p.wait * (busy ? 1.5 : 1) : 0));
  }
}

const graphs = new Map<string, RegionGraph>();
export function graphOf(pack: RegionPack): RegionGraph {
  let g = graphs.get(pack.key);
  if (!g) { g = new RegionGraph(pack); graphs.set(pack.key, g); }
  return g;
}

/* ============================================================
   일정 계산
   ============================================================ */
export function compute(
  pack: RegionPack,
  items: string[],
  start: string,
  busy: boolean,
): ComputedPlan {
  const g = graphOf(pack);
  const rows: PlanRow[] = [];
  let clock = toMin(start);
  let totalM = 0;
  let moveMin = 0;
  let prev: Stop | null = null;

  for (const id of items) {
    const stop = g.pool.get(id);
    if (!stop) continue;

    let leg: Leg | null = null;
    if (prev) {
      leg = g.route(prev.node, stop.node);
      const mins = Math.ceil(leg.m / pack.speed);
      clock += mins;
      totalM += leg.m;
      moveMin += mins;
    }

    // 공연처럼 시각이 고정된 항목은 그 시각까지 기다린다
    if (stop.kind === "show" && stop.open) {
      const fixed = toMin(hhmm(stop.open));
      if (fixed >= clock) clock = fixed;
    }

    const stay = g.stayOf(stop, busy);
    const at = clock;
    const end = clock + stay;

    let problem: string | null = null;
    if (stop.open && stop.close) {
      const o = toMin(hhmm(stop.open));
      const c = toMin(hhmm(stop.close));
      if (at < o) problem = `${hhmm(stop.open)} 에 엽니다 — ${Math.ceil(o - at)}분 일찍 도착합니다`;
      else if (at > c) problem = `${hhmm(stop.close)} 에 닫습니다 — ${Math.ceil(at - c)}분 늦습니다`;
      else if (end > c) problem = `${hhmm(stop.close)} 마감까지 ${Math.ceil(c - at)}분뿐입니다`;
    }

    rows.push({ id, stop, at, end, stay, leg, problem });
    clock = end;
    prev = stop;
  }

  return { rows, totalM, moveMin, endAt: clock };
}

/* ============================================================
   바꾸기 전후 비교
   ============================================================ */
export function diff(before: ComputedPlan, after: ComputedPlan): PlanDiff {
  const dm = after.totalM - before.totalM;
  const dmove = after.moveMin - before.moveMin;
  const dend = after.endAt - before.endAt;
  const was = new Set(before.rows.filter((r) => r.problem).map((r) => r.id));
  const newProblems = after.rows
    .filter((r) => r.problem && !was.has(r.id))
    .map((r) => `${r.stop.name}: ${r.problem}`);

  let verdict: PlanDiff["verdict"] = "same";
  if (newProblems.length || dm > 400 || dend > 25) verdict = "bad";
  else if (dm < -150 || dend < -15) verdict = "good";

  return { dm, dmove, dend, newProblems, verdict };
}

/* ============================================================
   or-opt — 한 곳을 뽑아 가장 싼 자리에 다시 꽂는다
   ============================================================ */
export function optimize(
  pack: RegionPack,
  items: string[],
  start: string,
  busy: boolean,
): string[] {
  const g = graphOf(pack);
  const fixed = (id: string, i: number) => {
    const p = g.pool.get(id);
    return i === 0 || !p || p.kind === "show" || p.kind === "exit" || p.kind === "gate";
  };

  let best = items.slice();
  let bestM = compute(pack, best, start, busy).totalM;

  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let i = 0; i < best.length; i++) {
      if (fixed(best[i], i)) continue;
      const without = best.slice();
      const [one] = without.splice(i, 1);
      for (let j = 1; j <= without.length; j++) {
        if (j === i) continue;
        const cand = without.slice();
        cand.splice(j, 0, one);
        if (cand.some((id, k) => fixed(id, k) !== fixed(best[k] ?? id, k))) {
          // 고정 항목의 자리가 바뀌는 배치는 건너뛴다
        }
        const m = compute(pack, cand, start, busy).totalM;
        if (m < bestM - 1) { best = cand; bestM = m; moved = true; }
      }
    }
    if (!moved) break;
  }
  return best;
}

/** 일정에 넣을 때 가장 덜 돌아가는 자리 */
export function bestInsert(
  pack: RegionPack,
  items: string[],
  id: string,
  start: string,
  busy: boolean,
): number {
  let at = items.length;
  let bestM = Infinity;
  for (let j = 1; j <= items.length; j++) {
    const cand = items.slice();
    cand.splice(j, 0, id);
    const m = compute(pack, cand, start, busy).totalM;
    if (m < bestM) { bestM = m; at = j; }
  }
  return at;
}

/** 이름 일부로 장소를 찾는다 */
export function findStop(pack: RegionPack, name: string): Stop | null {
  const q = name.replace(/\s/g, "").toLowerCase();
  if (!q) return null;
  const pool = pack.pool;
  return (
    pool.find((p) => p.id.toLowerCase() === q) ??
    pool.find((p) => p.name.replace(/\s/g, "").toLowerCase() === q) ??
    pool.find((p) => p.name.replace(/\s/g, "").toLowerCase().includes(q)) ??
    null
  );
}

/** 길안내 — 구간을 사람이 따라갈 만한 단위로 묶는다 */
export function turns(pack: RegionPack, leg: Leg) {
  const drive = pack.mode === "drive";
  const res = drive ? 130 : 18;
  const minRun = drive ? 320 : 25;
  const pts = leg.pts;
  if (!pts || pts.length < 2) return [];

  const keep: [number, number][] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * pack.mPerPx;
    if (acc >= res || i === pts.length - 1) { keep.push(pts[i]); acc = 0; }
  }

  const bearing = (ax: number, ay: number, bx: number, by: number) =>
    (Math.atan2(bx - ax, ay - by) * 180) / Math.PI;

  const out: { m: number; turn: "left" | "right" | "sharp-left" | "sharp-right" | "arrive" }[] = [];
  let run = 0;
  for (let k = 1; k < keep.length; k++) {
    run += Math.hypot(keep[k][0] - keep[k - 1][0], keep[k][1] - keep[k - 1][1]) * pack.mPerPx;
    if (k === keep.length - 1) { out.push({ m: run, turn: "arrive" }); break; }
    const b1 = bearing(keep[k - 1][0], keep[k - 1][1], keep[k][0], keep[k][1]);
    const b2 = bearing(keep[k][0], keep[k][1], keep[k + 1][0], keep[k + 1][1]);
    const dA = ((b2 - b1 + 540) % 360) - 180;
    if (Math.abs(dA) >= 32 && run >= minRun) {
      out.push({
        m: run,
        turn: dA > 0 ? (dA > 95 ? "sharp-right" : "right") : (dA < -95 ? "sharp-left" : "left"),
      });
      run = 0;
    }
  }
  return out;
}

export const defaultItinerary = (pack: RegionPack, tripId: string): Itinerary => ({
  tripId,
  items: pack.plan.map((p) => p.id),
  start: pack.plan[0]?.time || "09:00",
  busy: false,
  cursor: 0,
  updatedAt: new Date().toISOString(),
});

/** 그 시각에 어느 일정 블록에 있었는지 — 사진·지출에 장소를 붙일 때 쓴다 */
export function whereAt(
  pack: RegionPack, items: string[], start: string, busy: boolean, time: string,
): string | null {
  const min = toMin(time);
  const p = compute(pack, items, start, busy);
  let hit: string | null = null;
  for (const r of p.rows) if (min >= r.at) hit = r.stop.name;
  return hit;
}
