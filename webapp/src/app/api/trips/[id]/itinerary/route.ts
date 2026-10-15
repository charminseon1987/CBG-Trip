import { z } from "zod";
import { notFound, ok, parse } from "@/lib/http";
import { DATE_RE } from "@/lib/days";
import { guardTrip, needEdit } from "@/lib/guard";
import { store } from "@/lib/store";

const Put = z.object({
  /* 어느 날을 고치는가. 생략하면 첫날 — 하루 여행은 날짜를 말할 필요가 없다 */
  date: z.string().regex(DATE_RE).optional(),
  items: z.array(z.string()).min(1).optional(),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  busy: z.boolean().optional(),
  cursor: z.number().int().min(0).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/trips/:id/itinerary — 날마다의 순서·출발시각·커서.
 *  itinerary 는 첫날 — 하루 여행만 쓰던 화면이 그대로 돌게 남겨 둔다. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const days = await store.listItineraries(id);
  if (!days.length) return notFound("일정");
  return ok({ days, itinerary: days[0] });
}

/** PUT /api/trips/:id/itinerary — 제안을 확정할 때 쓴다 */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  /* 보기만 하는 사람은 공동의 것을 못 고친다 */
  const no = needEdit(g);
  if (no) return no;
  const p = await parse(req, Put);
  if (!p.ok) return p.res;
  const it = await store.putItinerary(id, p.data);
  return it ? ok({ itinerary: it }) : notFound("일정");
}
