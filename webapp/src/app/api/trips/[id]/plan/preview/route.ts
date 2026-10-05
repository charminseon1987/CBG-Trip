import { z } from "zod";
import { bestInsert, compute, diff, hm, optimize } from "@/lib/itinerary";
import { fail, notFound, ok, parse } from "@/lib/http";
import { getRegion } from "@/lib/regions";
import { guardTrip } from "@/lib/guard";
import { store } from "@/lib/store";

/** 바꾸기 전에 얼마나 늘고 주는지 — 모델 없이 도는 계산.
 *  화면은 이 결과를 확인 창에 띄우고, 사용자가 받아들이면
 *  PUT /api/trips/:id/itinerary 로 확정한다. */
const Body = z.object({
  action: z.enum(["add", "remove", "move", "optimize", "set"]),
  id: z.string().optional(),            // add · remove 대상
  from: z.number().int().optional(),    // move
  to: z.number().int().optional(),
  items: z.array(z.string()).optional(),// set
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const trip = g.trip;
  const pack = getRegion(trip.region);
  const it = await store.getItinerary(id);
  if (!pack || !it) return fail("no_map", "이 여행에는 지도 데이터가 없습니다.", 404);

  const p = await parse(req, Body);
  if (!p.ok) return p.res;
  const { action } = p.data;
  const cur = it.items;
  let next = cur.slice();
  let label = "";

  if (action === "add") {
    const stop = pack.pool.find((s) => s.id === p.data.id);
    if (!stop) return notFound("장소");
    if (cur.includes(stop.id)) return fail("already", "이미 일정에 있습니다.", 409);
    next.splice(bestInsert(pack, cur, stop.id, it.start, it.busy), 0, stop.id);
    label = `${stop.name} 넣기`;
  } else if (action === "remove") {
    const stop = pack.pool.find((s) => s.id === p.data.id);
    if (!stop || !cur.includes(stop.id)) return notFound("일정 항목");
    next = cur.filter((x) => x !== stop.id);
    label = `${stop.name} 빼기`;
  } else if (action === "move") {
    const { from, to } = p.data;
    if (from == null || to == null || from < 0 || from >= cur.length || to < 0 || to >= cur.length) {
      return fail("bad_index", "순서 번호가 범위를 벗어났습니다.", 422);
    }
    const [one] = next.splice(from, 1);
    next.splice(to, 0, one);
    label = "순서 바꾸기";
  } else if (action === "optimize") {
    next = optimize(pack, cur, it.start, it.busy);
    label = "순서 최적화";
  } else {
    if (!p.data.items?.length) return fail("bad_items", "items 가 필요합니다.", 422);
    next = p.data.items.filter((x) => pack.pool.some((s) => s.id === x));
    label = "일정 교체";
  }

  const before = compute(pack, cur, it.start, it.busy);
  const after = compute(pack, next, it.start, it.busy);
  const d = diff(before, after);

  const stayOf = (p: typeof before) => p.rows.reduce((s2, r) => s2 + r.stay, 0);
  const dStay = stayOf(after) - stayOf(before);

  /* 거리도 시각도 안 바뀌는 경우가 있다 — 그 이유를 적어 준다.
     1) 넣은 곳이 이미 지나가던 길 위에 있다  2) 공연처럼 시각이 고정된 항목이 여유를 흡수한다 */
  const hasAnchor = after.rows.some((r) => r.stop.kind === "show");
  let why: string | null = null;
  if (d.dm === 0 && dStay !== 0) {
    why = "지나가던 길 위라 더 걷지 않습니다.";
  }
  if (d.dend === 0 && dStay > 0 && hasAnchor) {
    why = (why ? why + " " : "") + "공연 시각이 고정이라 늘어난 시간은 여유 안에 들어갑니다.";
  }

  return ok({
    label,
    proposal: next,
    unchanged: next.length === cur.length && next.every((x, i) => x === cur[i]),
    before: { stops: before.rows.length, km: +(before.totalM / 1000).toFixed(2), ends_at: hm(before.endAt) },
    after: { stops: after.rows.length, km: +(after.totalM / 1000).toFixed(2), ends_at: hm(after.endAt) },
    delta: { m: Math.round(d.dm), moveMin: d.dmove, endMin: d.dend, stayMin: dStay },
    why,
    newProblems: d.newProblems,
    verdict: d.verdict,
  });
}
