import { z } from "zod";
import { fail, notFound, ok, parse } from "@/lib/http";
import { placeAt } from "@/lib/place";
import { guardTrip } from "@/lib/guard";
import { store } from "@/lib/store";

const Row = z.object({
  amount: z.number().int().positive(),
  category: z.enum(["ticket", "car", "food", "snack", "gift", "etc"]),
  memo: z.string().max(120).default(""),
  at: z.string().regex(/^\d{2}:\d{2}$/),
});

/** POST /api/trips/:id/expenses/bulk — 명세서에서 읽은 여러 건을 한 번에 넣는다 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  if (!(await store.getTrip(id))) return notFound("여행");
  const p = await parse(req, z.object({ rows: z.array(Row).min(1).max(500) }));
  if (!p.ok) return p.res;

  const added = [];
  for (const r of p.data.rows) {
    added.push(await store.addExpense(id, { ...r, place: await placeAt(id, r.at) }));
  }
  if (!added.length) return fail("empty", "넣을 내역이 없습니다.", 422);
  return ok({ added: added.length, rows: added }, { status: 201 });
}
