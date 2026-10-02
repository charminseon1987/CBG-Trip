import { notFound, ok } from "@/lib/http";
import { compute, hm, turns } from "@/lib/itinerary";
import { getRegion } from "@/lib/regions";
import { store } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/trips/:id/plan — 계산된 일정. 화면이 그대로 그릴 수 있는 모양.
 *  지도(SVG·좌표)는 /api/regions/:key 에서 따로 받는다. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const trip = await store.getTrip(id);
  if (!trip) return notFound("여행");
  const pack = getRegion(trip.region);
  const it = await store.getItinerary(id);
  if (!pack || !it) return ok({ mapped: false, trip, plan: null });

  const p = compute(pack, it.items, it.start, it.busy);
  return ok({
    mapped: true,
    region: {
      key: pack.key, title: pack.title, mode: pack.mode, speed: pack.speed,
      source: pack.source, vw: pack.vw, vh: pack.vh,
      zones: pack.zones,               /* 구역 id·이름·색 — 지도에서 구역을 갈라 칠한다 */
    },
    itinerary: it,
    summary: {
      stops: p.rows.length,
      total_km: +(p.totalM / 1000).toFixed(2),
      move_min: p.moveMin,
      ends_at: hm(p.endAt),
    },
    rows: p.rows.map((r, i) => ({
      no: i + 1,
      id: r.id,
      name: r.stop.name,
      zone: r.stop.zl,
      zoneId: r.stop.zone,
      x: r.stop.x,
      y: r.stop.y,
      at: hm(r.at),
      end: hm(r.end),
      stay: r.stay,
      note: r.stop.note,
      problem: r.problem,
      leg: r.leg ? { m: Math.round(r.leg.m), pts: r.leg.pts } : null,
      steps: r.leg ? turns(pack, r.leg).map((s) => ({ m: Math.round(s.m), turn: s.turn })) : [],
    })),
    candidates: pack.pool
      .filter((s) => !it.items.includes(s.id))
      .map((s) => ({
        id: s.id, name: s.name, zone: s.zl, zoneId: s.zone, kind: s.kind,
        x: s.x, y: s.y, rank: s.rank ?? 1, note: s.note,
      })),
  });
}
