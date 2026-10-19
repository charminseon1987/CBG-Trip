/* ============================================================
   알림 — "내가 지금 봐야 할 것" 을 한 번에 센다.

   지금까지는 해당 탭을 직접 열어야 알았다. 누가 여행에 들어오고 싶다고
   신청해도 주인이 함께 탭을 열기 전까지 모르고, 대화에 말이 와도 대화 탭을
   열어야 안다. 문을 두드렸는데 아무도 안 나오는 상태다.

   **새 표를 만들지 않는다.** 알릴 거리는 이미 다 DB 에 있다 —
     · 들어온 신청    trip_join_requests 의 pending
     · 내 신청 결과   trip_join_requests 의 approved·rejected
     · 안 읽은 말     chat_messages 와 chat_reads 의 차이
   그래서 세기만 한다. 알림을 따로 쌓아 두면 그 줄과 실제 상태가 어긋나는
   순간부터 거짓을 보여 주게 된다(신청을 거뒀는데 알림은 남아 있는 식).

   "언제까지 봤나" 만 기록이 필요한데, chat_reads 가 이미 (방, 사람, 읽은 시각)
   표다. 방 이름을 "notices" 로 한 줄 쓴다 — 표를 하나 더 만들 이유가 없다.
   ============================================================ */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { markRead, myRooms } from "./chat";

const ROOM = "notices";

async function conn() {
  const c = getDb();
  if (!c) throw new Error("DB 가 없어 알림을 셀 수 없습니다.");
  await c.ready;
  return c.db;
}

export interface Notice {
  kind: "join_request" | "join_result" | "chat";
  /** 눌렀을 때 갈 곳 */
  href: string;
  title: string;
  body: string;
  /** 같은 거리가 여럿이면 몇 개인지 (안 읽은 말 3 처럼) */
  count: number;
  at: string;
}

export interface Notices {
  items: Notice[];
  /** 종에 찍을 수 */
  badge: number;
  seenAt: string | null;
}

export async function notices(userId: string): Promise<Notices> {
  const db = await conn();

  const seen = await db.select({ readAt: schema.chatReads.readAt })
    .from(schema.chatReads)
    .where(and(eq(schema.chatReads.room, ROOM), eq(schema.chatReads.userId, userId)))
    .limit(1);
  const seenAt = seen[0]?.readAt ?? null;

  const items: Notice[] = [];

  /* ---- 1) 내가 주인인 여행에 들어온 신청 ---- */
  const owned = await db.select({ tripId: schema.tripMembers.tripId })
    .from(schema.tripMembers)
    .where(and(
      eq(schema.tripMembers.userId, userId),
      eq(schema.tripMembers.role, "owner"),
    ));
  if (owned.length) {
    const ids = owned.map((o) => o.tripId);
    const rows = await db.select({
      tripId: schema.tripJoinRequests.tripId,
      createdAt: schema.tripJoinRequests.createdAt,
      who: schema.users.name,
      title: schema.trips.title,
    })
      .from(schema.tripJoinRequests)
      .innerJoin(schema.users, eq(schema.users.id, schema.tripJoinRequests.userId))
      .innerJoin(schema.trips, eq(schema.trips.id, schema.tripJoinRequests.tripId))
      .where(and(
        inArray(schema.tripJoinRequests.tripId, ids),
        eq(schema.tripJoinRequests.status, "pending"),
      ));

    /* 여행마다 한 줄로 묶는다. 다섯 사람이 신청했다고 알림이 다섯 줄 뜨면
       종을 누르기가 싫어진다 */
    const byTrip = new Map<string, { title: string; who: string[]; at: string }>();
    for (const r of rows) {
      const cur = byTrip.get(r.tripId) ?? { title: r.title, who: [], at: r.createdAt };
      cur.who.push(r.who);
      if (r.createdAt > cur.at) cur.at = r.createdAt;
      byTrip.set(r.tripId, cur);
    }
    for (const [tripId, v] of byTrip) {
      items.push({
        kind: "join_request",
        href: `/trips/${tripId}`,
        title: `${v.title} — 들어오고 싶다는 사람 ${v.who.length}`,
        body: `${v.who.slice(0, 3).join(", ")}${v.who.length > 3 ? " 외" : ""} · 함께 탭에서 권한을 골라 허용하세요`,
        count: v.who.length,
        at: v.at,
      });
    }
  }

  /* ---- 2) 내가 넣은 신청의 결과 ---- */
  const mine = await db.select({
    tripId: schema.tripJoinRequests.tripId,
    status: schema.tripJoinRequests.status,
    decidedAt: schema.tripJoinRequests.decidedAt,
    title: schema.trips.title,
  })
    .from(schema.tripJoinRequests)
    .innerJoin(schema.trips, eq(schema.trips.id, schema.tripJoinRequests.tripId))
    .where(and(
      eq(schema.tripJoinRequests.userId, userId),
      sql`${schema.tripJoinRequests.status} in ('approved','rejected')`,
    ));
  for (const m of mine) {
    const at = m.decidedAt ?? "";
    /* 이미 본 결과는 안 띄운다 — 승인된 여행은 목록에 있으니 그걸로 충분하다 */
    if (seenAt && at && at <= seenAt) continue;
    items.push({
      kind: "join_result",
      href: m.status === "approved" ? `/trips/${m.tripId}` : "/",
      title: m.status === "approved" ? `${m.title} — 들어왔습니다` : `${m.title} — 거절됐습니다`,
      body: m.status === "approved"
        ? "일정·사진·가계부를 같이 볼 수 있습니다"
        : "다시 신청할 수 있습니다",
      count: 1,
      at,
    });
  }

  /* ---- 3) 안 읽은 말 ---- */
  for (const r of await myRooms(userId)) {
    if (!r.unread) continue;
    items.push({
      kind: "chat",
      /* 그룹 방은 그 여행으로, 일대일은 대화 목록으로 보낸다 */
      href: r.kind === "trip" && r.tripId ? `/trips/${r.tripId}` : "/chat",
      title: `${r.title} — 안 읽은 말 ${r.unread}`,
      body: r.lastBody.slice(0, 60),
      count: r.unread,
      at: r.lastAt,
    });
  }

  items.sort((a, b) => (b.at || "").localeCompare(a.at || ""));

  /* 종에 찍는 수: 신청은 처리하기 전까지 계속 센다 — "봤다" 와 "처리했다" 는
     다르다. 나머지는 마지막으로 본 뒤에 생긴 것만 센다 */
  const badge = items.reduce((n, i) => {
    if (i.kind === "join_request") return n + i.count;
    if (!seenAt || !i.at || i.at > seenAt) return n + i.count;
    return n;
  }, 0);

  return { items, badge, seenAt };
}

/** 종을 열면 "여기까지 봤다" 를 적는다 */
export async function markNoticesSeen(userId: string) {
  await markRead(ROOM, userId);
}
