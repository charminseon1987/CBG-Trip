import { z } from "zod";
import { notFound, ok, parse } from "@/lib/http";
import { placeAt } from "@/lib/place";
import { guardTrip } from "@/lib/guard";
import { store } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

const Patch = z.object({
  amount: z.number().int().positive().optional(),
  category: z.enum(["ticket", "car", "food", "snack", "gift", "etc"]).optional(),
  memo: z.string().max(120).optional(),
  at: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

/** 표에서 고친 값을 저장한다. 시각을 바꾸면 그 시각의 장소를 다시 붙인다. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, expenseId } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const p = await parse(req, Patch);
  if (!p.ok) return p.res;
  const patch: Record<string, unknown> = { ...p.data };
  if (p.data.at) patch.place = await placeAt(id, p.data.at);
  const expense = await store.updateExpense(id, expenseId, patch);
  return expense ? ok({ expense }) : notFound("지출");
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, expenseId } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const gone = await store.deleteExpense(id, expenseId);
  return gone ? ok({ deleted: expenseId }) : notFound("지출");
}
