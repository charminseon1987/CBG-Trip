import { ok } from "@/lib/http";
import { DATE_RE, dayLabel, tripDays } from "@/lib/days";
import { compute, hm, turns } from "@/lib/itinerary";
import { getRegion } from "@/lib/regions";
import { guardTrip } from "@/lib/guard";
import { store } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/trips/:id/plan — 계산된 일정. 화면이 그대로 그릴 수 있는 모양.
 *  지도(SVG·좌표)는 /api/regions/:key 에서 따로 받는다. */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const trip = g.trip;
  const pack = getRegion(trip.region);
  const all = await store.listItineraries(id);
  if (!pack || !all.length) return ok({ mapped: false, trip, plan: null, days: [] });

  /* 날짜 띠. 여행 기간의 모든 날 + 기간 밖인데 일정이 남아 있는 날
     (기간을 줄이면 그 날 일정은 지우지 않고 기간 밖으로 밀린다) */
  const days = tripDays(trip, all.map((d) => d.date)).map((d) => {
    const row = all.find((x) => x.date === d.date);
    return { ...d, label: dayLabel(d.date), stops: row?.items.length ?? 0 };
  });

  /* ?date= 로 볼 날을 고른다. 없거나 엉뚱하면 첫날 */
  const want = new URL(req.url).searchParams.get("date");
  const date = want && DATE_RE.test(want) && days.some((d) => d.date === want)
    ? want : (days[0]?.date ?? trip.date);
  const it = all.find((d) => d.date === date)
    /* 아직 안 짠 날은 빈 하루로 보여 준다 — 저장은 사람이 고칠 때 생긴다 */
    ?? { tripId: id, date, items: [], start: "09:00", busy: false, cursor: 0, updatedAt: "" };

  const p = compute(pack, it.items, it.start, it.busy);
  return ok({
    mapped: true,
    region: {
      key: pack.key, title: pack.title, mode: pack.mode, speed: pack.speed,
      source: pack.source, vw: pack.vw, vh: pack.vh,
      zones: pack.zones,               /* 구역 id·이름·색 — 지도에서 구역을 갈라 칠한다 */
      origin: pack.origin,             /* 위경도 → 지도 좌표 변환식. 내 위치를 찍는 데 쓴다 */
      mPerPx: pack.mPerPx,
    },
    /* 날짜 띠와 지금 보는 날 */
    days,
    date,
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
      kind: r.stop.kind,
      lat: r.stop.lat,
      lng: r.stop.lng,
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
    /* 아직 어느 날에도 안 넣은 곳. 다른 날에 넣은 곳은 다시 권하지 않는다 */
    candidates: pack.pool
      .filter((s) => !all.some((d) => d.items.includes(s.id)))
      .map((s) => ({
        id: s.id, name: s.name, zone: s.zl, zoneId: s.zone, kind: s.kind,
        x: s.x, y: s.y, rank: s.rank ?? 1, note: s.note,
      })),
  });
}
