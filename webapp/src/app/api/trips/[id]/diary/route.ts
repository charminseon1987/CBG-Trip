import { z } from "zod";
import { fail, notFound, ok, parse } from "@/lib/http";
import { store } from "@/lib/store";
import { DATE_RE } from "@/lib/days";
import { makeDiary } from "@/lib/diary";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/trips/:id/diary[?date=YYYY-MM-DD] — 그날 일기, 날짜가 없으면 전부 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await store.getTrip(id))) return notFound("여행");
  const date = new URL(req.url).searchParams.get("date");
  if (date) return ok({ diary: await store.getDiary(id, date) });
  return ok({ diaries: await store.listDiaries(id) });
}

const Body = z.object({
  date: z.string().regex(DATE_RE),
  memo: z.string().max(300).default(""),
});

/** POST /api/trips/:id/diary — 그날 사진으로 여행일기를 (다시) 쓴다 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const p = await parse(req, Body);
  if (!p.ok) return p.res;
  const r = await makeDiary(id, p.data.date, p.data.memo.trim());
  if ("error" in r) return fail("no_photos", r.error, 422);
  return ok({ diary: r }, { status: 201 });
}
