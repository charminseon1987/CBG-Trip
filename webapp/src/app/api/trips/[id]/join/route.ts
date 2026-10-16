import { z } from "zod";
import { currentUser, rateLimit } from "@/lib/auth";
import { fail, notFound, ok, parse } from "@/lib/http";
import { cancelRequest, requestJoin, statusOf } from "@/lib/joins";
import { roleOf } from "@/lib/members";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ message: z.string().max(200).default("") });

/** POST — 이 여행에 끼워 달라고 신청한다.
 *
 *  guardTrip 을 쓰지 않는다. 그건 "멤버인가" 를 묻는 문인데, 신청하는 사람은
 *  아직 멤버가 아니다. 대신 **주인이 찾을 수 있게 켜 둔 여행인지** 만 본다 —
 *  꺼져 있으면 404 다. 남의 여행 id 를 찍어 신청을 넣는 길을 막는다. */
export async function POST(req: Request, { params }: Ctx) {
  const me = await currentUser();
  if (!me) return fail("unauthorized", "로그인이 필요합니다.", 401);

  /* 신청을 쏟아붓지 못하게 — 사람당 10분에 다섯 번 */
  const wait = rateLimit(`join:${me.id}`, 5, 600_000);
  if (wait) return fail("throttled", wait, 429);

  const { id } = await params;
  const trip = await store.getTrip(id);
  if (!trip || !trip.discoverable) return notFound("여행");

  if (await roleOf(id, me.id)) {
    return fail("already_member", "이미 이 여행에 들어와 있습니다.", 409);
  }
  const was = await statusOf(id, me.id);
  if (was === "pending") return fail("already_asked", "이미 신청했습니다. 주인의 답을 기다려 주세요.", 409);

  const p = await parse(req, Body);
  if (!p.ok) return p.res;
  await requestJoin(id, me.id, p.data.message.trim());
  return ok({ status: "pending" }, { status: 201 });
}

/** DELETE — 아직 답을 안 받은 내 신청을 거둔다 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await currentUser();
  if (!me) return fail("unauthorized", "로그인이 필요합니다.", 401);
  const { id } = await params;
  await cancelRequest(id, me.id);
  return ok({ status: null });
}
