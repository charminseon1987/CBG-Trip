import { z } from "zod";
import { currentUser, rateLimit } from "@/lib/auth";
import { fail, notFound, ok, parse } from "@/lib/http";
import { canDm, dmRoom, listMessages, markRead, postMessage } from "@/lib/chat";
import { roleOf } from "@/lib/members";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ userId: string }> };

/* 일대일은 아무에게나 열지 않는다 — 같은 여행이거나, 신청으로 엮였거나,
   이미 주고받은 적이 있어야 한다 (lib/chat.ts 의 canDm).

   막혔을 때 403 이 아니라 404 를 낸다. 403 은 "그 사람은 있다" 를 알려 준다. */
export async function GET(_req: Request, { params }: Ctx) {
  const me = await currentUser();
  if (!me) return fail("unauthorized", "로그인이 필요합니다.", 401);
  const { userId } = await params;
  if (!(await canDm(me.id, userId))) return notFound("대화");

  const room = dmRoom(me.id, userId);
  const messages = await listMessages(room);
  await markRead(room, me.id);
  return ok({ room, messages, me: me.id });
}

const Body = z.object({
  body: z.string().max(2000).default(""),
  shareTripId: z.string().max(60).nullable().optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  const me = await currentUser();
  if (!me) return fail("unauthorized", "로그인이 필요합니다.", 401);
  const { userId } = await params;
  if (!(await canDm(me.id, userId))) return notFound("대화");

  const wait = rateLimit(`chat:${me.id}`, 30, 60_000);
  if (wait) return fail("throttled", wait, 429);

  const p = await parse(req, Body);
  if (!p.ok) return p.res;
  const text = p.data.body.trim();
  if (!text && !p.data.shareTripId) return fail("empty", "할 말을 적어 주세요.", 422);

  /* 여행 카드는 내가 멤버인 여행만 붙일 수 있다 — 남의 여행을 퍼뜨리지 못하게 */
  let share: string | null = null;
  if (p.data.shareTripId) {
    const t = await store.getTrip(p.data.shareTripId);
    if (!t || !(await roleOf(t.id, me.id))) {
      return fail("not_mine", "내가 들어가 있는 여행만 건넬 수 있습니다.", 403);
    }
    share = t.id;
  }

  const msg = await postMessage(dmRoom(me.id, userId), me.id, text, share);
  return ok({ message: msg }, { status: 201 });
}
