import { z } from "zod";
import { ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { store } from "@/lib/store";
import { placeAt } from "@/lib/place";
import { EXPENSE_CATEGORIES } from "@/lib/types";

const New = z.object({
  amount: z.number().int().positive(),
  category: z.enum(["ticket", "car", "food", "snack", "gift", "etc"]),
  memo: z.string().max(120).default(""),
  at: z.string().regex(/^\d{2}:\d{2}$/),
  place: z.string().nullable().default(null),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const rows = await store.listExpenses(id);
  const trip = await store.getTrip(id);
  const people = Math.max(1, trip?.people ?? 1);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return ok({
    rows,
    categories: EXPENSE_CATEGORIES,
    summary: { total, count: rows.length, people, perPerson: Math.round(total / people) },
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const p = await parse(req, New);
  if (!p.ok) return p.res;
  const place = p.data.place ?? (await placeAt(id, p.data.at));
  return ok({ expense: await store.addExpense(id, { ...p.data, place }) }, { status: 201 });
}
