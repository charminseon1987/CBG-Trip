import { z } from "zod";
import { notFound, ok, parse } from "@/lib/http";
import { placeAt } from "@/lib/place";
import { guardTrip, needEdit } from "@/lib/guard";
import { store } from "@/lib/store";
import { DATE_RE } from "@/lib/days";

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

const Patch = z.object({
  amount: z.number().int().positive().optional(),
  category: z.enum(["ticket", "car", "food", "snack", "gift", "etc"]).optional(),
  memo: z.string().max(120).optional(),
  /* 날짜를 옮긴다 — 명세서에서 가져온 줄의 날짜가 틀렸을 때 */
  date: z.string().regex(DATE_RE).optional(),
  at: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

/** 표에서 고친 값을 저장한다. 시각을 바꾸면 그 시각의 장소를 다시 붙인다. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, expenseId } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  /* 보기만 하는 사람은 공동의 것을 못 고친다 */
  const no = needEdit(g);
  if (no) return no;
  const p = await parse(req, Patch);
  if (!p.ok) return p.res;
  const patch: Record<string, unknown> = { ...p.data };
  /* 날짜나 시각이 바뀌면 그 날 그 시각에 있던 장소를 다시 붙인다 */
  if (p.data.at || p.data.date) {
    const cur = (await store.listExpenses(id)).find((e) => e.id === expenseId);
    if (!cur) return notFound("지출");
    patch.place = await placeAt(id, p.data.date ?? cur.date, p.data.at ?? cur.at);
  }
  const expense = await store.updateExpense(id, expenseId, patch);
  return expense ? ok({ expense }) : notFound("지출");
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, expenseId } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  /* 보기만 하는 사람은 공동의 것을 못 고친다 */
  const no = needEdit(g);
  if (no) return no;
  const gone = await store.deleteExpense(id, expenseId);
  return gone ? ok({ deleted: expenseId }) : notFound("지출");
}
