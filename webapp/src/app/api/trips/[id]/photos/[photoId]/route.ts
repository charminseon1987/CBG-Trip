import { z } from "zod";
import { fail, notFound, ok, parse } from "@/lib/http";
import { guardTrip, needEdit } from "@/lib/guard";
import { visiblePhotos } from "@/lib/photos";
import { store } from "@/lib/store";
import { dropPhoto } from "@/lib/blob";
import { DATE_RE } from "@/lib/days";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

const Patch = z.object({
  caption: z.string().max(200).optional(),
  date: z.string().regex(DATE_RE).optional(),
  takenAt: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  place: z.string().max(60).nullable().optional(),
  /* 나만 보기 ↔ 같이 보기. 올린 사람(또는 여행 주인)만 바꿀 수 있다 */
  visibility: z.enum(["private", "trip"]).optional(),
});

/* 이 사진을 손댈 수 있나.

   사진은 공동의 것이 아니라 올린 사람의 것이다. 그래서 보기만 하는 사람도
   자기가 올린 사진은 고치고 지운다 — 자기 것이니까. 거꾸로 고칠 권한이
   있어도 남이 올린 사진은 못 건드린다.

   여행 주인은 할 수 있다. 누군가 나가거나 엉뚱한 사진을 올렸을 때 치울
   사람이 하나는 있어야 한다.

   올린 사람을 모르는 옛 사진(userId NULL)은 여행에 한 사람뿐이던 때의
   것이다. 그건 공동의 것처럼 보고 고칠 권한으로 판정한다.

   "나만 보기" 사진은 여기까지 오지 않는다 — 부르는 쪽이 보이는 사진 중에서만
   찾으므로 남의 것은 404 가 된다. 안 보이는 사진을 주인이 고칠 수 있으면,
   PATCH 응답에 사진이 담겨 나오니 그걸로 내용을 읽을 수 있다. */
function mayTouch(
  g: Extract<Awaited<ReturnType<typeof guardTrip>>, { ok: true }>,
  photo: { userId: string | null },
) {
  if (photo.userId) {
    if (photo.userId === g.user?.id || g.canManage) return null;
    return fail("not_mine", "올린 사람이나 여행 주인만 할 수 있습니다.", 403);
  }
  return needEdit(g);
}

/** PATCH — 캡션·날짜·시각·장소 고치기 (날짜가 틀리게 읽힌 사진을 옮길 때) */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, photoId } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  /* 보이는 사진 중에서만 찾는다. 남의 "나만 보기" 는 없는 것과 같다 */
  const hit = (await visiblePhotos(id, g.user?.id ?? null)).find((x) => x.id === photoId);
  if (!hit) return notFound("사진");
  const no = mayTouch(g, hit);
  if (no) return no;
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
  const hit = (await visiblePhotos(id, g.user?.id ?? null)).find((p) => p.id === photoId);
  if (!hit) return notFound("사진");
  const no = mayTouch(g, hit);
  if (no) return no;
  const gone = await store.deletePhoto(id, photoId);
  if (gone && hit) await dropPhoto(hit.url);
  return gone ? ok({ deleted: photoId }) : notFound("사진");
}
