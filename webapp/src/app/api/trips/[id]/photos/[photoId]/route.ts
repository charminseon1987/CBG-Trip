import { notFound, ok } from "@/lib/http";
import { store } from "@/lib/store";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id, photoId } = await params;
  const gone = await store.deletePhoto(id, photoId);
  return gone ? ok({ deleted: photoId }) : notFound("사진");
}
