import { z } from "zod";
import { fail, ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { listMessages, markRead, postMessage, tripRoom } from "@/lib/chat";
import { rateLimit } from "@/lib/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET — 이 여행 멤버들의 그룹 대화. 보기만 하는 사람도 읽고 쓴다 —
 *  대화는 공동의 기록이 아니라 사람끼리 하는 말이다. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const room = tripRoom(id);
  const messages = await listMessages(room);
  if (g.user) await markRead(room, g.user.id);
  return ok({ room, messages, me: g.user?.id ?? null });
}

const Body = z.object({
  body: z.string().max(2000).default(""),
  /* 여행 카드를 붙인다. 지금 방의 여행이거나, 내가 멤버인 다른 여행 */
  shareTripId: z.string().max(60).nullable().optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  if (!g.user) return fail("unauthorized", "로그인이 필요합니다.", 401);

  const wait = rateLimit(`chat:${g.user.id}`, 30, 60_000);
  if (wait) return fail("throttled", wait, 429);

  const p = await parse(req, Body);
  if (!p.ok) return p.res;
  const text = p.data.body.trim();
  if (!text && !p.data.shareTripId) return fail("empty", "할 말을 적어 주세요.", 422);

  const msg = await postMessage(tripRoom(id), g.user.id, text, p.data.shareTripId ?? null);
  return ok({ message: msg }, { status: 201 });
}
