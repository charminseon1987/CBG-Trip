import { z } from "zod";
import { fail, notFound, ok, parse } from "@/lib/http";
import { store } from "@/lib/store";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Patch = z.object({
  title: z.string().min(1).max(60).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  place: z.string().max(80).optional(),
  people: z.number().int().min(1).max(30).optional(),
  theme: z.string().max(20).optional(),
  region: z.string().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const me = await currentUser();
  if (store.canSee && !(await store.canSee(id, me))) return notFound("여행");
  const trip = await store.getTrip(id);
  return trip ? ok({ trip }) : notFound("여행");
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const p = await parse(req, Patch);
  if (!p.ok) return p.res;
  const trip = await store.updateTrip(id, p.data);
  return trip ? ok({ trip }) : notFound("여행");
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const gone = await store.deleteTrip(id);
  return gone ? ok({ deleted: id }) : fail("not_deletable", "기본 여행이거나 없는 여행입니다.", 409);
}
