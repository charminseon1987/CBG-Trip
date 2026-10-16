import { z } from "zod";
import { fail, ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { createInvite, listMembers, liveInvites } from "@/lib/members";
import { pendingRequests } from "@/lib/joins";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET — 누가 같이 하고 있나. 멤버면 볼 수 있다 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;

  /* 살아 있는 초대장은 주인에게만 보여 준다 — 다른 멤버가 알 필요가 없고,
     목록에 뜨면 "아직 안 온 사람" 이 누구인지까지 새어 나간다 */
  return ok({
    members: await listMembers(id),
    /* 들어오고 싶다는 사람. 주인에게만 — 누가 문을 두드렸다는 것 자체가
       그 사람의 일이다 */
    requests: g.canManage ? await pendingRequests(id) : [],
    /* 내 userId 도 같이 — 목록에서 "나" 를 가려내고, 스스로 나가는 단추를 붙인다 */
    me: { id: g.user?.id ?? null, role: g.role, canEdit: g.canEdit, canManage: g.canManage },
    invites: g.canManage
      ? (await liveInvites(id)).map((i) => ({
          /* 토큰 해시는 취소할 때 쓰는 손잡이다. 이걸로는 들어갈 수 없다 */
          handle: i.tokenHash, label: i.label, role: i.role, expiresAt: i.expiresAt,
          /* 링크 전체. 들어올 때마다 다시 복사할 수 있어야 한다.
             원문이 없는 옛 초대장은 null — 그건 새로 만들어 보내야 한다 */
          url: i.token ? new URL(`/invite/${i.token}`, req.url).toString() : null,
        }))
      : [],
  });
}

const Body = z.object({
  role: z.enum(["editor", "viewer"]).default("editor"),
  label: z.string().max(60).default(""),
});

/** POST — 초대장을 하나 만든다. 링크는 **이 응답에서만** 나온다 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  if (!g.canManage) return fail("forbidden", "여행 주인만 초대할 수 있습니다.", 403);
  if (!g.user) return fail("unauthorized", "로그인이 필요합니다.", 401);

  const p = await parse(req, Body);
  if (!p.ok) return p.res;

  const { token, expiresAt } = await createInvite(id, g.user.id, p.data.role, p.data.label);
  /* 전체 주소를 만들어 준다 — 그래야 바로 카카오톡에 붙여 넣을 수 있다 */
  const url = new URL(`/invite/${token}`, req.url).toString();
  return ok({ url, expiresAt }, { status: 201 });
}
