import { z } from "zod";
import { notFound, ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { store } from "@/lib/store";
import { dropPhoto } from "@/lib/blob";
import { DATE_RE } from "@/lib/days";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

const Patch = z.object({
  caption: z.string().max(200).optional(),
  date: z.string().regex(DATE_RE).optional(),
  takenAt: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  place: z.string().max(60).nullable().optional(),
});

/** PATCH — 캡션·날짜·시각·장소 고치기 (날짜가 틀리게 읽힌 사진을 옮길 때) */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, photoId } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const p = await parse(req, Patch);
  if (!p.ok) return p.res;
  const photo = await store.updatePhoto(id, photoId, p.data);
  return photo ? ok({ photo }) : notFound("사진");
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, photoId } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  /* 지우기 전에 주소를 봐 둬야 저장소의 파일도 같이 지울 수 있다 */
  const hit = (await store.listPhotos(id)).find((p) => p.id === photoId);
  const gone = await store.deletePhoto(id, photoId);
  if (gone && hit) await dropPhoto(hit.url);
  return gone ? ok({ deleted: photoId }) : notFound("사진");
}
