import { z } from "zod";
import { ok, parse } from "@/lib/http";
import { guardTrip, needEdit } from "@/lib/guard";
import { store } from "@/lib/store";
import { placeAt } from "@/lib/place";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { DATE_RE, dayLabel, tripDays } from "@/lib/days";

const New = z.object({
  amount: z.number().int().positive(),
  category: z.enum(["ticket", "car", "food", "snack", "gift", "etc"]),
  memo: z.string().max(120).default(""),
  /* 며칠짜리 여행이면 어느 날 쓴 돈인지 받아야 한다. 생략하면 첫날.
     여행 기간 밖도 받는다 — 티켓을 미리 사는 일이 흔하다 */
  date: z.string().regex(DATE_RE).optional(),
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

  /* 날짜 띠 — 여행 기간의 모든 날 + 기간 밖에 쓴 날. 사진 탭과 같은 방식이다.
     날마다 합계와 1인당을 같이 내준다. 화면이 다시 더하지 않게 */
  const days = trip
    ? tripDays(trip, rows.map((r) => r.date)).map((d) => {
        const mine = rows.filter((r) => r.date === d.date);
        const sum = mine.reduce((s, r) => s + r.amount, 0);
        return {
          ...d, label: dayLabel(d.date), count: mine.length,
          total: sum, perPerson: Math.round(sum / people),
        };
      })
    : [];
  /* 날짜를 아직 안 정한 것들 (명세서에 날짜가 없던 줄) */
  const undated = rows.filter((r) => !DATE_RE.test(r.date));

  return ok({
    rows,
    categories: EXPENSE_CATEGORIES,
    days,
    undated: { count: undated.length, total: undated.reduce((s, r) => s + r.amount, 0) },
    summary: { total, count: rows.length, people, perPerson: Math.round(total / people) },
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  /* 보기만 하는 사람은 공동의 것을 못 고친다 */
  const no = needEdit(g);
  if (no) return no;
  const p = await parse(req, New);
  if (!p.ok) return p.res;
  const date = p.data.date ?? g.trip.date;
  const place = p.data.place ?? (await placeAt(id, date, p.data.at));
  return ok(
    { expense: await store.addExpense(id, { ...p.data, date, place }) },
    { status: 201 },
  );
}
