import { z } from "zod";
import { fail, notFound, ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { ownerCount, removeMember, roleOf, setRole } from "@/lib/members";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; userId: string }> };

const Patch = z.object({ role: z.enum(["owner", "editor", "viewer"]) });

/** PATCH — 권한을 바꾼다. 주인만 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, userId } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  if (!g.canManage) return fail("forbidden", "여행 주인만 할 수 있습니다.", 403);

  const was = await roleOf(id, userId);
  if (!was) return notFound("멤버");

  const p = await parse(req, Patch);
  if (!p.ok) return p.res;

  /* 마지막 주인을 끌어내리면 아무도 사람을 들이고 내보낼 수 없게 된다 */
  if (was === "owner" && p.data.role !== "owner" && (await ownerCount(id)) <= 1) {
    return fail("last_owner", "주인이 한 명뿐입니다. 다른 주인을 먼저 세워 주세요.", 409);
  }
  await setRole(id, userId, p.data.role);
  return ok({ userId, role: p.data.role });
}

/** DELETE — 내보낸다. 주인이거나, 자기가 스스로 나가는 경우 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, userId } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;

  const self = g.user?.id === userId;
  if (!g.canManage && !self) {
    return fail("forbidden", "여행 주인만 내보낼 수 있습니다.", 403);
  }
  const was = await roleOf(id, userId);
  if (!was) return notFound("멤버");

  /* 마지막 주인이 나가면 그 여행은 아무도 관리할 수 없게 된다 */
  if (was === "owner" && (await ownerCount(id)) <= 1) {
    return fail("last_owner", "주인이 한 명뿐입니다. 다른 주인을 먼저 세워 주세요.", 409);
  }
  await removeMember(id, userId);
  return ok({ removed: userId });
}
