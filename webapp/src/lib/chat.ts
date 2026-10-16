/* ============================================================
   대화 — 여행 멤버들의 그룹 대화와, 두 사람 사이의 송수신.

   방 이름이 어느 방인지 말한다.
     trip:<여행 id>        그 여행 멤버 전부
     dm:<작은 id>:<큰 id>   두 사람. id 를 정렬해 붙이므로 쌍마다 방이 하나다

   누가 들어갈 수 있나만 다르고 읽고 쓰는 길은 같다. 그래서 표는 하나다.

   일대일은 아무에게나 열지 않는다. 모르는 사람이 아무에게나 말을 걸 수 있으면
   그게 바로 스팸 창구다. 셋 중 하나여야 한다 —
     · 같은 여행에 들어와 있다
     · 한쪽이 다른 쪽 여행에 신청을 넣었다 (주인 ↔ 신청자)
     · 이미 둘이 주고받은 대화가 있다
   ============================================================ */
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, gt, like, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { canSee, myTripIds, roleOf } from "./members";

async function conn() {
  const c = getDb();
  if (!c) throw new Error("DB 가 없어 대화를 쓸 수 없습니다.");
  await c.ready;
  return c.db;
}

export const tripRoom = (tripId: string) => `trip:${tripId}`;
/** 쌍마다 방 하나 — 누가 먼저 걸었는지와 무관하게 같은 방이 되도록 정렬한다 */
export const dmRoom = (a: string, b: string) =>
  `dm:${[a, b].sort().join(":")}`;

/** dm 방 이름에서 상대를 꺼낸다 */
export function dmPartner(room: string, me: string): string | null {
  if (!room.startsWith("dm:")) return null;
  const [, a, b] = room.split(":");
  return a === me ? b : b === me ? a : null;
}

/* ---------- 들어갈 수 있나 ---------- */

/** 일대일을 걸 수 있나. 위 세 가지 중 하나여야 한다 */
export async function canDm(me: string, you: string): Promise<boolean> {
  if (me === you) return false;
  const db = await conn();

  /* 1) 같은 여행 */
  const mine = await myTripIds(me);
  if (mine.length) {
    const shared = await db.select({ tripId: schema.tripMembers.tripId })
      .from(schema.tripMembers)
      .where(and(
        eq(schema.tripMembers.userId, you),
        inArray(schema.tripMembers.tripId, mine),
      ))
      .limit(1);
    if (shared.length) return true;
  }

  /* 2) 한쪽이 다른 쪽 여행에 신청 — 주인이 신청자에게 물어볼 수 있어야 한다 */
  const asked = await db.select({ tripId: schema.tripJoinRequests.tripId })
    .from(schema.tripJoinRequests)
    .where(or(eq(schema.tripJoinRequests.userId, me), eq(schema.tripJoinRequests.userId, you)));
  for (const a of asked) {
    const other = (await roleOf(a.tripId, me)) ? you : me;
    /* 신청한 쪽이 아닌 사람이 그 여행 주인이면 통과 */
    const asOwner = (await roleOf(a.tripId, other === me ? you : me)) === "owner";
    if (asOwner) return true;
  }

  /* 3) 이미 주고받은 적이 있다 */
  const room = dmRoom(me, you);
  const had = await db.select({ id: schema.chatMessages.id })
    .from(schema.chatMessages).where(eq(schema.chatMessages.room, room)).limit(1);
  return had.length > 0;
}

/** 이 방에 들어갈 수 있나 */
export async function canEnter(
  room: string, viewer: { id: string; role: string },
): Promise<boolean> {
  if (room.startsWith("trip:")) {
    /* 그룹 대화는 그 여행을 볼 수 있는 사람 전부 — 보기만 하는 사람도 말은 한다.
       대화는 공동의 기록이 아니라 사람끼리 하는 말이다 */
    return canSee(room.slice(5), viewer);
  }
  if (room.startsWith("dm:")) {
    const you = dmPartner(room, viewer.id);
    if (!you) return false;                  // 내가 끼지 않은 쌍
    return canDm(viewer.id, you);
  }
  return false;
}

/* ---------- 읽기 · 쓰기 ---------- */

export interface Msg {
  id: string;
  room: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  /** 붙인 여행 카드 — 제목·지역·날짜까지만 */
  share: { id: string; title: string; place: string; date: string; end: string } | null;
}

/** 최근 것부터 n개를 가져와 오래된 순으로 돌려준다 (화면이 아래로 쌓으므로) */
export async function listMessages(room: string, limit = 50): Promise<Msg[]> {
  const db = await conn();
  const rows = await db.select({
    id: schema.chatMessages.id,
    room: schema.chatMessages.room,
    authorId: schema.chatMessages.authorId,
    body: schema.chatMessages.body,
    createdAt: schema.chatMessages.createdAt,
    shareTripId: schema.chatMessages.shareTripId,
    authorName: schema.users.name,
  })
    .from(schema.chatMessages)
    .innerJoin(schema.users, eq(schema.users.id, schema.chatMessages.authorId))
    .where(eq(schema.chatMessages.room, room))
    .orderBy(desc(schema.chatMessages.createdAt))
    .limit(Math.min(200, Math.max(1, limit)));

  const ids = [...new Set(rows.map((r) => r.shareTripId).filter(Boolean))] as string[];
  const cards = new Map<string, Msg["share"]>();
  if (ids.length) {
    const trips = await db.select({
      id: schema.trips.id, title: schema.trips.title, place: schema.trips.place,
      date: schema.trips.date, end: schema.trips.end,
    }).from(schema.trips).where(inArray(schema.trips.id, ids));
    for (const t of trips) cards.set(t.id, t);
  }

  return rows.reverse().map((r) => ({
    id: r.id, room: r.room, authorId: r.authorId, authorName: r.authorName,
    body: r.body, createdAt: r.createdAt,
    share: r.shareTripId ? cards.get(r.shareTripId) ?? null : null,
  }));
}

/** 한 줄 보낸다. 여행 카드를 붙일 수 있다 */
export async function postMessage(
  room: string, authorId: string, body: string, shareTripId?: string | null,
): Promise<Msg> {
  const db = await conn();
  const row = {
    id: `m-${randomBytes(6).toString("hex")}`,
    room, authorId, body,
    shareTripId: shareTripId ?? null,
    createdAt: new Date().toISOString(),
  };
  await db.insert(schema.chatMessages).values(row);
  /* 보낸 사람은 당연히 읽은 것이다 */
  await markRead(room, authorId);
  const [one] = await listMessages(room, 1);
  return one ?? { ...row, authorName: "", share: null };
}

export async function markRead(room: string, userId: string) {
  const db = await conn();
  const readAt = new Date().toISOString();
  await db.insert(schema.chatReads).values({ room, userId, readAt })
    .onConflictDoUpdate({
      target: [schema.chatReads.room, schema.chatReads.userId],
      set: { readAt },
    });
}

export interface Room {
  room: string;
  kind: "trip" | "dm";
  /** 여행 방이면 여행 제목, 일대일이면 상대 이름 */
  title: string;
  tripId: string | null;
  partnerId: string | null;
  lastBody: string;
  lastAt: string;
  unread: number;
}

/** 내 대화 목록 — 안 읽은 수와 마지막 한 줄까지.
 *
 *  내가 멤버인 여행의 그룹 방은 **말이 없어도** 목록에 넣는다. 비어 있는 방이
 *  안 보이면 첫 말을 꺼낼 자리가 없다. */
export async function myRooms(userId: string): Promise<Room[]> {
  const db = await conn();
  const tripIds = await myTripIds(userId);
  const roomNames = new Set(tripIds.map(tripRoom));

  /* 내가 끼어 있는 dm 방 — 방 이름에 내 id 가 들어 있다 */
  const dms = await db.selectDistinct({ room: schema.chatMessages.room })
    .from(schema.chatMessages)
    .where(and(
      like(schema.chatMessages.room, "dm:%"),
      like(schema.chatMessages.room, `%${userId}%`),
    ));
  for (const d of dms) if (dmPartner(d.room, userId)) roomNames.add(d.room);

  const out: Room[] = [];
  for (const room of roomNames) {
    const last = (await listMessages(room, 1))[0] ?? null;
    const read = await db.select({ readAt: schema.chatReads.readAt })
      .from(schema.chatReads)
      .where(and(eq(schema.chatReads.room, room), eq(schema.chatReads.userId, userId)))
      .limit(1);
    const since = read[0]?.readAt ?? "";
    const unread = (await db.select({ n: sql<number>`count(*)` })
      .from(schema.chatMessages)
      .where(and(
        eq(schema.chatMessages.room, room),
        since ? gt(schema.chatMessages.createdAt, since) : sql`1=1`,
      )))[0]?.n ?? 0;

    if (room.startsWith("trip:")) {
      const tripId = room.slice(5);
      const t = await db.select({ title: schema.trips.title })
        .from(schema.trips).where(eq(schema.trips.id, tripId)).limit(1);
      out.push({
        room, kind: "trip", title: t[0]?.title ?? "여행", tripId, partnerId: null,
        lastBody: last?.body ?? "", lastAt: last?.createdAt ?? "", unread: Number(unread),
      });
    } else {
      const you = dmPartner(room, userId)!;
      const u = await db.select({ name: schema.users.name, email: schema.users.email })
        .from(schema.users).where(eq(schema.users.id, you)).limit(1);
      out.push({
        room, kind: "dm", title: u[0]?.name || u[0]?.email || "대화", tripId: null,
        partnerId: you,
        lastBody: last?.body ?? "", lastAt: last?.createdAt ?? "", unread: Number(unread),
      });
    }
  }
  /* 말이 있던 방이 위로. 빈 방은 아래로 */
  return out.sort((a, b) => (b.lastAt || "").localeCompare(a.lastAt || ""));
}
