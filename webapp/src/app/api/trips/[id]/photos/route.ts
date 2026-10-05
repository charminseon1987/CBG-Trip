import { z } from "zod";
import { ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { store } from "@/lib/store";
import { placeAt } from "@/lib/place";

/* 지금은 파일을 받지 않고 URL/data URI 만 받는다.
   스토리지(S3·Vercel Blob)를 붙이면 여기서 업로드 URL 을 내준다. */
const New = z.object({
  url: z.string().min(1).max(8_000_000),   // 1280px JPEG data URI 를 받는다
  takenAt: z.string().regex(/^\d{2}:\d{2}$/),
  caption: z.string().max(200).default(""),
  place: z.string().nullable().default(null),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const photos = await store.listPhotos(id);
  return ok({ photos, total: photos.length, captioned: photos.filter((p) => p.caption).length });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const p = await parse(req, New);
  if (!p.ok) return p.res;
  const place = p.data.place ?? (await placeAt(id, p.data.takenAt));
  return ok({ photo: await store.addPhoto(id, { ...p.data, place }) }, { status: 201 });
}
