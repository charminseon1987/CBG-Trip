import { z } from "zod";
import { fail, ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { store } from "@/lib/store";
import { placeAt } from "@/lib/place";
import { visiblePhotos } from "@/lib/photos";
import { storePhoto } from "@/lib/blob";
import { DATE_RE, tripDays } from "@/lib/days";

/* 지금은 파일을 받지 않고 URL/data URI 만 받는다. (화면은 브라우저에서 줄인 JPEG data URI 를 보낸다)
   스토리지(S3·Vercel Blob)를 붙이면 여기서 업로드 URL 을 내준다. */
const New = z.object({
  url: z.string().min(1).max(8_000_000),   // 1280px JPEG data URI 를 받는다
  date: z.string().regex(DATE_RE).optional(),          // 생략하면 여행 첫날
  takenAt: z.string().regex(/^\d{2}:\d{2}$/),
  caption: z.string().max(200).default(""),
  place: z.string().nullable().default(null),
  /* 기본은 나만 보기. 올린 사람이 골라서 공개한다 */
  visibility: z.enum(["private", "trip"]).default("private"),
});

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/trips/:id/photos[?date=YYYY-MM-DD]
 *  days 는 사진 탭 날짜 띠 — 여행 기간의 모든 날 + 기간 밖에 찍힌 날, 날마다 장수와 일기 여부 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const date = new URL(req.url).searchParams.get("date");

  /* 남의 "나만 보기" 는 여기서 걸러진다. 날짜 띠의 장수도 거른 뒤에 센다 —
     안 그러면 "3장" 이라는데 두 장만 보이는 일이 생긴다 */
  const all = await visiblePhotos(id, g.user?.id ?? null);
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
  /* 그 사진이 찍힌 **날의** 일정에서 장소를 찾는다. 날짜를 안 넘기면
     며칠짜리 여행에서 둘째 날 사진에 첫날 장소가 붙는다 */
  const place = p.data.place ?? (await placeAt(id, date, p.data.takenAt));
  /* 저장소가 붙어 있으면 파일로 올리고 DB 에는 주소만 적는다 (lib/blob.ts).

     실패하면 거기서 멈춘다. data URI 로 되돌리지 않는다 — 그러면 한 장에
     600KB 씩 DB 에 들어가 나중에 사진 탭이 통째로 안 열린다. 지금 알려 주는
     편이 낫다. */
  let url: string;
  try {
    url = await storePhoto(id, p.data.url);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    console.error("[photos] 사진 저장 실패:", why);
    return fail("storage_failed", `사진을 저장하지 못했습니다. ${why}`, 502);
  }
  /* 올린 사람을 적어 둔다. 이걸 빼먹으면 내 사진을 내가 고치는지도 못 알아본다 */
  const photo = await store.addPhoto(id, {
    ...p.data, url, date, place, userId: g.user?.id ?? null,
  });
  return ok({ photo }, { status: 201 });
}
