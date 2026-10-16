import { z } from "zod";
import { fail, notFound, ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { decideRequest, statusOf } from "@/lib/joins";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; userId: string }> };

/* 허용할 때 권한을 같이 정한다 — "어디까지 보여 줄까" 가 승인의 절반이다.
   owner 는 여기서 주지 않는다. 처음 들어오는 사람을 주인으로 만드는 실수는
   한 번이면 되돌리기 어렵다. 들인 뒤 멤버 목록에서 올릴 수 있다. */
const Body = z.object({
  allow: z.boolean(),
  role: z.enum(["editor", "viewer"]).default("viewer"),
});

/** PATCH — 주인이 허용하거나 거절한다 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, userId } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  if (!g.canManage) return fail("forbidden", "여행 주인만 할 수 있습니다.", 403);
  if (!g.user) return fail("unauthorized", "로그인이 필요합니다.", 401);

  if ((await statusOf(id, userId)) !== "pending") return notFound("신청");

  const p = await parse(req, Body);
  if (!p.ok) return p.res;
  await decideRequest(id, userId, g.user.id, p.data.allow, p.data.role);
  return ok({ userId, status: p.data.allow ? "approved" : "rejected", role: p.data.role });
}
