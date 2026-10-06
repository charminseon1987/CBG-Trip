import { z } from "zod";
import { ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { store } from "@/lib/store";
import { placeAt } from "@/lib/place";
import { DATE_RE, tripDays } from "@/lib/days";

/* 지금은 파일을 받지 않고 URL/data URI 만 받는다. (화면은 브라우저에서 줄인 JPEG data URI 를 보낸다)
   스토리지(S3·Vercel Blob)를 붙이면 여기서 업로드 URL 을 내준다. */
const New = z.object({
  url: z.string().min(1).max(8_000_000),   // 1280px JPEG data URI 를 받는다
  date: z.string().regex(DATE_RE).optional(),          // 생략하면 여행 첫날
  takenAt: z.string().regex(/^\d{2}:\d{2}$/),
  caption: z.string().max(200).default(""),
  place: z.string().nullable().default(null),
});

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/trips/:id/photos[?date=YYYY-MM-DD]
 *  days 는 사진 탭 날짜 띠 — 여행 기간의 모든 날 + 기간 밖에 찍힌 날, 날마다 장수와 일기 여부 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const date = new URL(req.url).searchParams.get("date");

  const all = await store.listPhotos(id);
  const diaries = await store.listDiaries(id);
  const days = tripDays(g.trip, all.map((p) => p.date)).map((d) => ({
    ...d,
    photos: all.filter((p) => p.date === d.date).length,
    diary: diaries.some((x) => x.date === d.date),
  }));
  const photos = date ? all.filter((p) => p.date === date) : all;
  return ok({ photos, days, total: photos.length, captioned: photos.filter((p) => p.caption).length });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const p = await parse(req, New);
  if (!p.ok) return p.res;
  const date = p.data.date ?? g.trip.date;
  const place = p.data.place ?? (await placeAt(id, p.data.takenAt));
  return ok({ photo: await store.addPhoto(id, { ...p.data, date, place }) }, { status: 201 });
}
