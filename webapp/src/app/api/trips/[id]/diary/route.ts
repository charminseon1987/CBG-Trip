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

/* PATCH — 사람이 글을 고친다. 장면의 시각·사진 묶음은 사진에서 정해지므로 손대지 않고,
   글(제목·문장·이름표·말풍선·스티커)만 바꾼다. */
const Edit = z.object({
  date: z.string().regex(DATE_RE),
  title: z.string().min(1).max(40).optional(),
  mood: z.string().max(8).optional(),
  opening: z.string().max(300).optional(),
  closing: z.string().max(200).optional(),
  stickers: z.array(z.string().max(8)).max(6).optional(),
  cover: z.string().optional(),
  stops: z
    .array(z.object({
      index: z.number().int().min(0),
      line: z.string().max(200).optional(),
      label: z.string().max(16).optional(),
      bubble: z.string().max(12).optional(),
    }))
    .optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const p = await parse(req, Edit);
  if (!p.ok) return p.res;
  const cur = await store.getDiary(id, p.data.date);
  if (!cur) return notFound("일기");
  const { stops: edits, date: _d, ...rest } = p.data;
  const stops = cur.stops.map((s, i) => {
    const e = edits?.find((x) => x.index === i);
    return e ? { ...s, ...Object.fromEntries(Object.entries(e).filter(([k, v]) => k !== "index" && v !== undefined)) } : s;
  });
  const cover = rest.cover && cur.stops.some((s) => s.photoIds.includes(rest.cover!)) ? rest.cover : cur.cover;
  const next = { ...cur, ...rest, cover, stops, madeAt: new Date().toISOString() };
  return ok({ diary: await store.putDiary(next) });
}
