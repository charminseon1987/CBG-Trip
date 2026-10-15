import { fail, notFound, ok } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { liveInvites, revokeInvite } from "@/lib/members";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; handle: string }> };

/** DELETE — 아직 안 쓴 초대장을 거둔다. 링크를 잘못 보냈을 때.

    손잡이(handle)는 토큰의 sha256 이다. GET /members 가 주인에게만 내려 준다.
    이걸로는 여행에 들어갈 수 없다 — 들어가는 데 쓰는 원문은 DB 에 없다. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, handle } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  if (!g.canManage) return fail("forbidden", "여행 주인만 할 수 있습니다.", 403);

  /* 64자 16진수가 아니면 볼 것도 없다 */
  if (!/^[0-9a-f]{64}$/.test(handle)) return notFound("초대장");

  /* 이 여행의 살아 있는 초대장인지 먼저 본다 — 없는 것을 지웠는데
     "지웠다" 고 답하면, 화면에서 사라져 취소된 줄 알게 된다 */
  const live = await liveInvites(id);
  if (!live.some((i) => i.tokenHash === handle)) return notFound("초대장");

  await revokeInvite(id, handle);
  return ok({ revoked: handle });
}
