import { z } from "zod";
import { notFound, ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { store } from "@/lib/store";

const Put = z.object({
  items: z.array(z.string()).min(1).optional(),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  busy: z.boolean().optional(),
  cursor: z.number().int().min(0).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/trips/:id/itinerary — 저장된 순서·출발시각·커서 */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const it = await store.getItinerary(id);
  return it ? ok({ itinerary: it }) : notFound("일정");
}

/** PUT /api/trips/:id/itinerary — 제안을 확정할 때 쓴다 */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const p = await parse(req, Put);
  if (!p.ok) return p.res;
  const it = await store.putItinerary(id, p.data);
  return it ? ok({ itinerary: it }) : notFound("일정");
}
