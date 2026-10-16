/* ============================================================
   "저도 끼워 주세요" — 찾은 사람이 문을 두드리는 길.

   초대 링크(lib/members.ts)는 주인이 먼저 손을 내미는 길이다. 여기는 반대
   방향이다. 검색으로 여행을 찾은 사람이 신청을 넣고, 주인이 **권한을 골라**
   열어 준다. 신청만으로는 아무것도 못 본다 — 제목·지역·날짜까지가 전부다.

   검색에 나오는 것은 주인이 켠 여행뿐이다(trips.discoverable). 기본은 꺼짐 —
   가족 여행 제목과 날짜가 모르는 사람에게 보이는 것부터가 새는 것이다.
   ============================================================ */
import { and, eq, like, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { addMember, roleOf, type TripRole } from "./members";

export type JoinStatus = "pending" | "approved" | "rejected";

async function conn() {
  const c = getDb();
  if (!c) throw new Error("DB 가 없어 신청을 쓸 수 없습니다.");
  await c.ready;
  return c.db;
}

/* ---------- 찾기 ---------- */

export interface Found {
  id: string;
  title: string;
  place: string;
  date: string;
  end: string;
  people: number;
  theme: string;
  /** 나와 이 여행의 관계 — 화면이 단추를 무엇으로 보일지 정하는 데 쓴다 */
  mine: TripRole | null;
  request: JoinStatus | null;
}

/** 주인이 켜 둔 여행만 찾는다. 글자가 두 자 미만이면 아무것도 안 준다 —
 *  빈 검색으로 목록을 쓸어 가는 길을 만들지 않는다. */
export async function searchTrips(q: string, viewerId: string | null): Promise<Found[]> {
  const needle = q.trim();
  if (needle.length < 2) return [];
  const db = await conn();

  const rows = await db.select({
    id: schema.trips.id, title: schema.trips.title, place: schema.trips.place,
    date: schema.trips.date, end: schema.trips.end,
    people: schema.trips.people, theme: schema.trips.theme,
  })
    .from(schema.trips)
    .where(and(
      eq(schema.trips.discoverable, true),
      or(
        like(schema.trips.title, `%${needle}%`),
        like(schema.trips.place, `%${needle}%`),
      ),
    ))
    .limit(20);

  const out: Found[] = [];
  for (const t of rows) {
    out.push({
      ...t,
      mine: viewerId ? await roleOf(t.id, viewerId) : null,
      request: viewerId ? await statusOf(t.id, viewerId) : null,
    });
  }
  return out;
}

/* ---------- 신청 ---------- */

export async function statusOf(tripId: string, userId: string): Promise<JoinStatus | null> {
  const db = await conn();
  const r = await db.select({ status: schema.tripJoinRequests.status })
    .from(schema.tripJoinRequests)
    .where(and(
      eq(schema.tripJoinRequests.tripId, tripId),
      eq(schema.tripJoinRequests.userId, userId),
    ))
    .limit(1);
  return (r[0]?.status as JoinStatus) ?? null;
}

/** 신청을 넣는다. 거절당한 뒤 다시 넣으면 같은 줄이 pending 으로 돌아간다 —
 *  줄을 쌓지 않는다(PK 가 여행+사람이다). */
export async function requestJoin(tripId: string, userId: string, message: string) {
  const db = await conn();
  await db.insert(schema.tripJoinRequests)
    .values({ tripId, userId, message, status: "pending" })
    .onConflictDoUpdate({
      target: [schema.tripJoinRequests.tripId, schema.tripJoinRequests.userId],
      set: {
        message, status: "pending",
        createdAt: new Date().toISOString(),
        decidedAt: null, decidedBy: null,
      },
    });
}

/** 신청을 거둔다. 아직 결정 전인 것만 — 이미 승인된 것은 "나가기" 로 처리한다 */
export async function cancelRequest(tripId: string, userId: string) {
  const db = await conn();
  await db.delete(schema.tripJoinRequests).where(and(
    eq(schema.tripJoinRequests.tripId, tripId),
    eq(schema.tripJoinRequests.userId, userId),
    eq(schema.tripJoinRequests.status, "pending"),
  ));
}

export interface Pending {
  userId: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

/** 아직 답 안 한 신청. 주인에게만 보여 준다 */
export async function pendingRequests(tripId: string): Promise<Pending[]> {
  const db = await conn();
  const rows = await db.select({
    userId: schema.tripJoinRequests.userId,
    message: schema.tripJoinRequests.message,
    createdAt: schema.tripJoinRequests.createdAt,
    name: schema.users.name,
    email: schema.users.email,
  })
    .from(schema.tripJoinRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.tripJoinRequests.userId))
    .where(and(
      eq(schema.tripJoinRequests.tripId, tripId),
      eq(schema.tripJoinRequests.status, "pending"),
    ));
  return rows as Pending[];
}

/** 주인이 답한다. 허용하면 그 자리에서 권한을 정해 멤버로 넣는다.
 *
 *  거절한 줄은 지우지 않고 rejected 로 남긴다 — 지우면 같은 사람이 거절당한
 *  줄 모르고 계속 신청하고, 주인은 같은 신청을 계속 다시 본다. */
export async function decideRequest(
  tripId: string, userId: string, decidedBy: string,
  allow: boolean, role: TripRole = "viewer",
) {
  const db = await conn();
  if (allow) await addMember(tripId, userId, role);
  await db.update(schema.tripJoinRequests)
    .set({
      status: allow ? "approved" : "rejected",
      decidedAt: new Date().toISOString(),
      decidedBy,
    })
    .where(and(
      eq(schema.tripJoinRequests.tripId, tripId),
      eq(schema.tripJoinRequests.userId, userId),
    ));
}

export interface MyRequest {
  tripId: string;
  title: string;
  place: string;
  date: string;
  status: JoinStatus;
  createdAt: string;
}

/** 내가 넣은 신청 — "기다리는 중" 을 보여 주려고. 안 보여 주면 사람이 같은
 *  신청을 또 넣는다 */
export async function myRequests(userId: string): Promise<MyRequest[]> {
  const db = await conn();
  const rows = await db.select({
    tripId: schema.tripJoinRequests.tripId,
    status: schema.tripJoinRequests.status,
    createdAt: schema.tripJoinRequests.createdAt,
    title: schema.trips.title,
    place: schema.trips.place,
    date: schema.trips.date,
  })
    .from(schema.tripJoinRequests)
    .innerJoin(schema.trips, eq(schema.trips.id, schema.tripJoinRequests.tripId))
    .where(eq(schema.tripJoinRequests.userId, userId))
    .orderBy(sql`${schema.tripJoinRequests.createdAt} desc`);
  return rows as MyRequest[];
}
