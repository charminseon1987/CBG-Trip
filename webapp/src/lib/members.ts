/* ============================================================
   여행을 같이 하는 사람.

   지금까지 접근 판정은 trips.user_id 한 칸이었다 — 주인 아니면 404.
   여기서부터는 trip_members 가 그 자리를 대신한다.

   권한 세 가지
     owner   여행을 지우고, 사람을 들이고 내보낸다. 여행마다 적어도 한 명
     editor  공동 일정·가계부를 고친다
     viewer  보기만. 다만 **자기 개인 레이어는 고친다** — 자기 것이니까

   초대장 토큰은 해시해서 넣는다. 세션과 같은 이유다 — DB 가 새더라도
   그 값만으로는 남의 여행에 못 들어온다. 원문은 만들 때 한 번만 보여 준다.
   ============================================================ */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export type TripRole = "owner" | "editor" | "viewer";

/** 초대장은 2주면 충분하다. 더 길면 흘린 링크가 오래 살아 있다 */
const INVITE_DAYS = 14;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function conn() {
  const c = getDb();
  if (!c) throw new Error("DB 가 없어 멤버를 쓸 수 없습니다.");
  await c.ready;
  return c.db;
}

/* ---------- 멤버 ---------- */

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: TripRole;
  joinedAt: string;
}

export async function listMembers(tripId: string): Promise<Member[]> {
  const db = await conn();
  const rows = await db.select({
    userId: schema.tripMembers.userId,
    role: schema.tripMembers.role,
    joinedAt: schema.tripMembers.joinedAt,
    name: schema.users.name,
    email: schema.users.email,
  })
    .from(schema.tripMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.tripMembers.userId))
    .where(eq(schema.tripMembers.tripId, tripId));
  return rows as Member[];
}

/** 이 사람의 권한. 멤버가 아니면 null */
export async function roleOf(tripId: string, userId: string): Promise<TripRole | null> {
  const db = await conn();
  const r = await db.select({ role: schema.tripMembers.role })
    .from(schema.tripMembers)
    .where(and(eq(schema.tripMembers.tripId, tripId), eq(schema.tripMembers.userId, userId)))
    .limit(1);
  return (r[0]?.role as TripRole) ?? null;
}

export async function addMember(tripId: string, userId: string, role: TripRole = "editor") {
  const db = await conn();
  await db.insert(schema.tripMembers).values({ tripId, userId, role }).onConflictDoNothing();
}

/* trips.user_id 는 멤버 표가 생기기 전의 주인 칸이다. 아래 canSee·canEdit·canManage
   가 아직 이 칸을 보고 바로 통과시킨다 — 옮겨 적기(PATCH_SQL)가 빠뜨린 여행에서도
   주인이 잠기지 않게 하려고 둔 안전장치다.

   그 안전장치에 구멍이 있었다. 만든 사람이 멤버에서 빠지거나 권한이 내려가도
   이 칸이 그 사람을 가리키는 동안은 계속 주인처럼 행동한다 — 내보내기와 나가기가
   그 사람에게만 듣지 않는다.

   그래서 멤버가 바뀔 때마다 이 칸을 남은 주인 하나로 다시 맞춘다. 멤버 표가 진짜고
   이 칸은 거울이다. NULL 로는 절대 두지 않는다 — NULL 은 "주인 없는 기본 여행"
   (누구나 본다)을 뜻하므로, 비워 두면 가족 여행이 공개된다. */
async function syncLegacyOwner(tripId: string) {
  const db = await conn();
  const t = await db.select({ userId: schema.trips.userId })
    .from(schema.trips).where(eq(schema.trips.id, tripId)).limit(1);
  const mirror = t[0]?.userId ?? null;
  if (!mirror) return;                                   // 기본 여행은 건드리지 않는다
  if ((await roleOf(tripId, mirror)) === "owner") return; // 아직 주인이면 그대로 둔다

  const owners = await db.select({ userId: schema.tripMembers.userId })
    .from(schema.tripMembers)
    .where(and(eq(schema.tripMembers.tripId, tripId), eq(schema.tripMembers.role, "owner")))
    .limit(1);
  /* 주인이 아무도 없으면 그대로 둔다 — 라우트의 마지막 주인 보호가 막으므로
     생기지 않지만, 생겼다면 비우는 쪽이 더 위험하다 */
  if (!owners.length) return;
  await db.update(schema.trips).set({ userId: owners[0].userId })
    .where(eq(schema.trips.id, tripId));
}

/** 권한만 바꾼다. 지우고 다시 넣으면 들어온 날짜(joined_at)가 날아간다 */
export async function setRole(tripId: string, userId: string, role: TripRole) {
  const db = await conn();
  await db.update(schema.tripMembers).set({ role })
    .where(and(eq(schema.tripMembers.tripId, tripId), eq(schema.tripMembers.userId, userId)));
  await syncLegacyOwner(tripId);
}

export async function removeMember(tripId: string, userId: string) {
  const db = await conn();
  await db.delete(schema.tripMembers)
    .where(and(eq(schema.tripMembers.tripId, tripId), eq(schema.tripMembers.userId, userId)));
  await syncLegacyOwner(tripId);
}

/** 주인이 몇 명인가. 마지막 주인을 내보내지 못하게 막는 데 쓴다 */
export async function ownerCount(tripId: string): Promise<number> {
  const db = await conn();
  const rows = await db.select({ userId: schema.tripMembers.userId })
    .from(schema.tripMembers)
    .where(and(eq(schema.tripMembers.tripId, tripId), eq(schema.tripMembers.role, "owner")));
  return rows.length;
}

/** 내가 속한 여행 id 들 — 여행 목록이 쓴다 */
export async function myTripIds(userId: string): Promise<string[]> {
  const db = await conn();
  const rows = await db.select({ tripId: schema.tripMembers.tripId })
    .from(schema.tripMembers).where(eq(schema.tripMembers.userId, userId));
  return rows.map((r) => r.tripId);
}

/* ---------- 초대장 ---------- */

export interface Invite {
  tripId: string;
  role: TripRole;
  label: string;
  expiresAt: number;
  usedAt: string | null;
}

/** 초대장을 만든다. 원문 토큰은 **여기서만** 나온다 — DB 에는 해시만 남는다 */
export async function createInvite(
  tripId: string, invitedBy: string, role: TripRole = "editor", label = "",
): Promise<{ token: string; expiresAt: number }> {
  const db = await conn();
  const token = randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + INVITE_DAYS * 864e5;
  await db.insert(schema.tripInvites).values({
    tokenHash: sha(token), tripId, role, label, invitedBy, expiresAt,
  });
  return { token, expiresAt };
}

/** 아직 살아 있는 초대장만 — 쓴 것·지난 것은 뺀다 */
export async function liveInvites(tripId: string) {
  const db = await conn();
  const rows = await db.select({
    role: schema.tripInvites.role, label: schema.tripInvites.label,
    expiresAt: schema.tripInvites.expiresAt, createdAt: schema.tripInvites.createdAt,
    tokenHash: schema.tripInvites.tokenHash,
  })
    .from(schema.tripInvites)
    .where(and(eq(schema.tripInvites.tripId, tripId), isNull(schema.tripInvites.usedAt)));
  return rows.filter((r) => r.expiresAt > Date.now());
}

export async function revokeInvite(tripId: string, tokenHash: string) {
  const db = await conn();
  await db.delete(schema.tripInvites)
    .where(and(eq(schema.tripInvites.tripId, tripId), eq(schema.tripInvites.tokenHash, tokenHash)));
}

/** 소모하지 않고 들여다본다 — 화면이 "무슨 여행인지" 를 보여 주려고.
    쓴 것·지난 것은 null 이다. used_at 은 건드리지 않는다. */
export async function peek(token: string): Promise<
  { tripId: string; title: string; date: string; role: TripRole } | null
> {
  const db = await conn();
  const r = await db.select({
    tripId: schema.tripInvites.tripId,
    role: schema.tripInvites.role,
    usedAt: schema.tripInvites.usedAt,
    expiresAt: schema.tripInvites.expiresAt,
    title: schema.trips.title,
    date: schema.trips.date,
  })
    .from(schema.tripInvites)
    .innerJoin(schema.trips, eq(schema.trips.id, schema.tripInvites.tripId))
    .where(eq(schema.tripInvites.tokenHash, sha(token))).limit(1);
  const i = r[0];
  if (!i || i.usedAt || i.expiresAt <= Date.now()) return null;
  return { tripId: i.tripId, title: i.title, date: i.date, role: i.role as TripRole };
}

/** 토큰을 받아 멤버로 만든다. 실패하면 까닭을 돌려준다 */
export async function redeem(
  token: string, userId: string,
): Promise<{ ok: true; tripId: string } | { ok: false; why: string }> {
  const db = await conn();
  const r = await db.select().from(schema.tripInvites)
    .where(eq(schema.tripInvites.tokenHash, sha(token))).limit(1);
  const inv = r[0];
  if (!inv) return { ok: false, why: "없는 초대장입니다." };
  if (inv.usedAt) return { ok: false, why: "이미 쓴 초대장입니다." };
  if (inv.expiresAt <= Date.now()) return { ok: false, why: "기한이 지난 초대장입니다." };

  await addMember(inv.tripId, userId, inv.role as TripRole);
  /* 한 번 쓰면 끝낸다. 링크가 돌아다녀도 두 번째 사람은 못 들어온다 */
  await db.update(schema.tripInvites)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(schema.tripInvites.tokenHash, sha(token)));
  return { ok: true, tripId: inv.tripId };
}

/* ---------- 볼 수 있나 · 고칠 수 있나 ---------- */

/** 멤버십을 본다. 주인 없는 기본 여행(에버랜드)은 누구나 본다 */
export async function canSee(
  tripId: string, viewer?: { id: string; role: string } | null,
): Promise<boolean> {
  const db = await conn();
  const t = await db.select({ userId: schema.trips.userId })
    .from(schema.trips).where(eq(schema.trips.id, tripId)).limit(1);
  if (!t.length) return false;
  if (!t[0].userId) return true;              // 주인 없는 기본 여행
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  /* 옛 여행은 trip_members 로 옮겨 적었지만(PATCH_SQL), 혹시 빠진 게 있어도
     주인은 들어갈 수 있어야 한다 — 그래서 둘 다 본다 */
  if (t[0].userId === viewer.id) return true;
  return (await roleOf(tripId, viewer.id)) !== null;
}

/** 공동의 것(일정·가계부·여행 정보)을 고칠 수 있나 */
export async function canEdit(
  tripId: string, viewer?: { id: string; role: string } | null,
): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  const db = await conn();
  const t = await db.select({ userId: schema.trips.userId })
    .from(schema.trips).where(eq(schema.trips.id, tripId)).limit(1);
  if (!t.length) return false;
  if (!t[0].userId) return true;              // 주인 없는 기본 여행
  if (t[0].userId === viewer.id) return true;
  const r = await roleOf(tripId, viewer.id);
  return r === "owner" || r === "editor";
}

/** 사람을 들이고 내보낼 수 있나 — 주인만 */
export async function canManage(
  tripId: string, viewer?: { id: string; role: string } | null,
): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  const db = await conn();
  const t = await db.select({ userId: schema.trips.userId })
    .from(schema.trips).where(eq(schema.trips.id, tripId)).limit(1);
  if (!t.length || !t[0].userId) return false;   // 기본 여행은 초대할 게 없다
  if (t[0].userId === viewer.id) return true;
  return (await roleOf(tripId, viewer.id)) === "owner";
}

export { or };
