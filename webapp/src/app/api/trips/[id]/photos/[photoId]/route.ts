import { z } from "zod";
import { notFound, ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { store } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

/** 캡션 수정 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, photoId } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const p = await parse(req, z.object({ caption: z.string().max(200) }));
  if (!p.ok) return p.res;
  const photo = await store.updatePhoto(id, photoId, { caption: p.data.caption });
  return photo ? ok({ photo }) : notFound("사진");
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, photoId } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const gone = await store.deletePhoto(id, photoId);
  return gone ? ok({ deleted: photoId }) : notFound("사진");
}
