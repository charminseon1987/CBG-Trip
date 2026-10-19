import { currentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { markNoticesSeen } from "@/lib/notices";
import { hasDb } from "@/db/client";

export const dynamic = "force-dynamic";

/** POST /api/notices/seen — 종을 열었다. "여기까지 봤다" 를 적는다.
 *
 *  신청은 이걸로 안 사라진다 — 처리(허용·거절)해야 사라진다. */
export async function POST() {
  const me = await currentUser();
  if (!me) return fail("unauthorized", "로그인이 필요합니다.", 401);
  if (hasDb()) await markNoticesSeen(me.id);
  return ok({ seen: true });
}
