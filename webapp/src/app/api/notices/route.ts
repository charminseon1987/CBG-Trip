import { currentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { notices } from "@/lib/notices";
import { hasDb } from "@/db/client";

export const dynamic = "force-dynamic";

/** GET /api/notices — 지금 봐야 할 것들과 종에 찍을 수.
 *
 *  알림을 쌓아 두지 않고 그때그때 센다 — 쌓아 두면 실제 상태와 어긋난다.
 *  메모리 구현(DB 없음)에서는 셀 표가 없으니 빈 목록이다. */
export async function GET() {
  const me = await currentUser();
  if (!me) return fail("unauthorized", "로그인이 필요합니다.", 401);
  if (!hasDb()) return ok({ items: [], badge: 0, seenAt: null });
  return ok(await notices(me.id));
}
