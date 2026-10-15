import { z } from "zod";
import { fail, notFound, ok, parse } from "@/lib/http";
import { placeAt } from "@/lib/place";
import { guardTrip, needEdit } from "@/lib/guard";
import { store } from "@/lib/store";

const Row = z.object({
  amount: z.number().int().positive(),
  category: z.enum(["ticket", "car", "food", "snack", "gift", "etc"]),
  memo: z.string().max(120).default(""),
  /* 명세서에 날짜가 있으면 그대로 쓴다. 없으면 여행 첫날로 넣는다 —
     하루 여행이면 그게 맞고, 며칠짜리면 사람이 표에서 옮긴다 */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
  /* 보기만 하는 사람은 공동의 것을 못 고친다 */
  const no = needEdit(g);
  if (no) return no;
  const trip = await store.getTrip(id);
  if (!trip) return notFound("여행");
  const p = await parse(req, z.object({ rows: z.array(Row).min(1).max(500) }));
  if (!p.ok) return p.res;

  const added = [];
  for (const r of p.data.rows) {
    const date = r.date ?? trip.date;
    added.push(await store.addExpense(id, { ...r, date, place: await placeAt(id, date, r.at) }));
  }
  if (!added.length) return fail("empty", "넣을 내역이 없습니다.", 422);
  return ok({ added: added.length, rows: added }, { status: 201 });
}
