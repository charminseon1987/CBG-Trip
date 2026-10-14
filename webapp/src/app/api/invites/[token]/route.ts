import { currentUser, rateLimit } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { peek, redeem } from "@/lib/members";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

/** GET — 초대장을 **소모하지 않고** 들여다본다. 화면이 "무슨 여행인지" 를 보여 준다.
    토큰을 쥔 사람에게만 답하므로 여행 이름이 새어 나가지 않는다. */
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const r = await peek(token);
  if (!r) return fail("bad_invite", "없거나 기한이 지난 초대장입니다.", 404);
  return ok(r);
}

/** POST /api/invites/:token — 초대장을 받아 그 여행의 멤버가 된다.

    GET 이 아니라 POST 인 까닭: 카카오톡·메신저가 링크를 미리 열어 보는 일이
    흔하다. GET 으로 멤버가 되게 하면 사람이 누르기도 전에 초대장이 소모된다.
    그래서 링크(/invite/:token)는 화면만 보여 주고, 단추를 눌러야 여기로 온다. */
export async function POST(_req: Request, { params }: Ctx) {
  const me = await currentUser();
  if (!me) return fail("unauthorized", "로그인이 필요합니다.", 401);

  /* 토큰을 찍어 맞히지 못하게 — 24바이트라 사실상 불가능하지만 값싸게 막는다 */
  const wait = rateLimit(`invite:${me.id}`, 20, 60_000);
  if (wait) return fail("throttled", wait, 429);

  const { token } = await params;
  const r = await redeem(token, me.id);
  if (!r.ok) return fail("bad_invite", r.why, 404);
  return ok({ tripId: r.tripId });
}
