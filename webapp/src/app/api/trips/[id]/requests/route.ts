import { fail, ok } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { pendingRequests } from "@/lib/joins";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET — 들어오고 싶다는 사람들. 주인만 본다.
 *
 *  다른 멤버에게도 숨긴다 — 누가 문을 두드렸다는 것 자체가 그 사람의 일이다. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  if (!g.canManage) return fail("forbidden", "여행 주인만 볼 수 있습니다.", 403);
  return ok({ requests: await pendingRequests(id) });
}
