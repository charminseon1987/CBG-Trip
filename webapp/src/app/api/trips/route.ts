import { z } from "zod";
import { ok, parse } from "@/lib/http";
import { store } from "@/lib/store";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const NewTrip = z.object({
  title: z.string().min(1).max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  place: z.string().max(80).default(""),
  people: z.number().int().min(1).max(30).default(1),
  theme: z.string().max(20).default("가족"),
  region: z.string().nullable().optional(),
});

/** GET /api/trips */
export async function GET() {
  const me = await currentUser();
  return ok({ trips: await store.listTrips(me) });
}

/** POST /api/trips — 새 여행. region 을 주지 않으면 장소 이름으로 지역팩을 짐작한다. */
export async function POST(req: Request) {
  const p = await parse(req, NewTrip);
  if (!p.ok) return p.res;
  const me = await currentUser();
  const trip = await store.createTrip({
    ...p.data, end: p.data.end ?? p.data.date, userId: me?.id ?? null,
  });
  return ok({ trip }, { status: 201 });
}
