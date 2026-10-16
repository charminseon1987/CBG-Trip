import { currentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { myRooms } from "@/lib/chat";

export const dynamic = "force-dynamic";

/** GET /api/chat/rooms — 내 대화 목록. 안 읽은 수와 마지막 한 줄까지.
 *  멤버인 여행의 그룹 방은 말이 없어도 나온다 — 첫 말을 꺼낼 자리가 있어야 한다. */
export async function GET() {
  const me = await currentUser();
  if (!me) return fail("unauthorized", "로그인이 필요합니다.", 401);
  return ok({ rooms: await myRooms(me.id) });
}
