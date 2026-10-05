/* ============================================================
   로그인 — 외부 인증 라이브러리 없이 node:crypto 만 쓴다.

   · 비밀번호는 scrypt 로 해시한다. 평문은 받자마자 버리고 어디에도 안 남긴다.
   · 세션 토큰은 32바이트 난수. DB 에는 그 해시만 넣는다 —
     DB 가 새더라도 그 값만으로는 로그인할 수 없다.
   · 쿠키는 HttpOnly 라 자바스크립트가 못 읽는다.

   혼자·가족이 쓰는 앱이라 이 정도가 맞다. 외부 로그인(구글 등)을 붙일 때가 오면
   그때 Auth.js 로 갈아타면 되고, users 테이블은 그대로 쓸 수 있다.
   ============================================================ */
import {
  randomBytes, scrypt as _scrypt, createHash, timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { and, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { COOKIE } from "./session-cookie";

const scrypt = promisify(_scrypt) as (p: string | Buffer, s: string | Buffer, k: number) => Promise<Buffer>;

export { COOKIE } from "./session-cookie";
const SESSION_DAYS = 30;
const KEYLEN = 64;

export type Role = "admin" | "member";
export interface User {
  id: string; email: string; name: string; role: Role; createdAt: string;
}

/* ---------- 비밀번호 ---------- */

/** "scrypt$<salt>$<key>" 로 저장한다. 알고리즘을 바꿔도 옛 해시를 알아볼 수 있게. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const key = await scrypt(plain, salt, KEYLEN);
  return `scrypt$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [algo, salt, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !salt || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const actual = await scrypt(plain, salt, expected.length);
  // 길이가 다르면 timingSafeEqual 이 던진다 — 먼저 거른다
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** 너무 쉬운 비밀번호를 막는다. 길이가 가장 크게 좌우한다. */
export function checkPasswordStrength(p: string): string | null {
  if (p.length < 10) return "비밀번호는 10자 이상이어야 합니다.";
  if (/^\d+$/.test(p)) return "숫자만으로는 안 됩니다.";
  if (/^(.)\1+$/.test(p)) return "같은 글자만 반복할 수 없습니다.";
  const common = ["password", "12345678", "qwerty", "admin123", "비밀번호"];
  if (common.some((c) => p.toLowerCase().includes(c))) return "너무 흔한 비밀번호입니다.";
  return null;
}

/* ---------- 세션 ---------- */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function conn() {
  const c = getDb();
  if (!c) throw new Error("DATABASE_URL 이 없어 로그인을 쓸 수 없습니다.");
  await c.ready;
  return c.db;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: number }> {
  const db = await conn();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_DAYS * 864e5;
  await db.insert(schema.sessions).values({ tokenHash: sha(token), userId, expiresAt });
  // 지난 세션은 이때 같이 치운다
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, Date.now()));
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  const db = await conn();
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha(token)));
}

export async function destroyAllSessions(userId: string) {
  const db = await conn();
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

/** 쿠키의 토큰으로 사용자를 찾는다. 없거나 만료면 null. */
export async function userFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const db = await conn();
  const rows = await db.select({
    id: schema.users.id, email: schema.users.email, name: schema.users.name,
    role: schema.users.role, createdAt: schema.users.createdAt,
    expiresAt: schema.sessions.expiresAt,
  })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.tokenHash, sha(token)))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  if (r.expiresAt < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha(token)));
    return null;
  }
  return { id: r.id, email: r.email, name: r.name, role: r.role as Role, createdAt: r.createdAt };
}

/** 서버 컴포넌트·라우트에서 지금 로그인한 사람 */
export async function currentUser(): Promise<User | null> {
  let token: string | undefined;
  try {
    token = (await cookies()).get(COOKIE)?.value;
  } catch {
    return null;                       // 쿠키를 못 읽는 자리(정적 렌더 등)
  }
  if (!token) return null;
  try {
    return await userFromToken(token);
  } catch (e) {
    // 조용히 null 을 주면 "로그인이 왜 안 되지" 를 영영 못 찾는다
    console.error("[auth] 세션 조회 실패:", e);
    return null;
  }
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new Error("로그인이 필요합니다.");
  return u;
}

/* ---------- 사용자 ---------- */

export async function userCount(): Promise<number> {
  const db = await conn();
  const rows = await db.select({ id: schema.users.id }).from(schema.users);
  return rows.length;
}

export async function findByEmail(email: string) {
  const db = await conn();
  const r = await db.select().from(schema.users)
    .where(eq(schema.users.email, email.trim().toLowerCase())).limit(1);
  return r[0] ?? null;
}

export async function createUser(
  email: string, name: string, password: string, role: Role = "member",
): Promise<User> {
  const db = await conn();
  const id = `u-${randomBytes(6).toString("hex")}`;
  const row = {
    id,
    email: email.trim().toLowerCase(),
    name: name.trim(),
    passwordHash: await hashPassword(password),
    role,
    createdAt: new Date().toISOString(),
  };
  await db.insert(schema.users).values(row);
  return { id, email: row.email, name: row.name, role, createdAt: row.createdAt };
}

export async function listUsers(): Promise<User[]> {
  const db = await conn();
  const rows = await db.select({
    id: schema.users.id, email: schema.users.email, name: schema.users.name,
    role: schema.users.role, createdAt: schema.users.createdAt,
  }).from(schema.users);
  return rows as User[];
}

export async function setRole(userId: string, role: Role) {
  const db = await conn();
  await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));
}

export async function setPassword(userId: string, password: string) {
  const db = await conn();
  await db.update(schema.users).set({ passwordHash: await hashPassword(password) })
    .where(eq(schema.users.id, userId));
  await destroyAllSessions(userId);        // 비밀번호를 바꾸면 모든 기기에서 로그아웃
}

export async function deleteUser(userId: string) {
  const db = await conn();
  await db.delete(schema.users).where(eq(schema.users.id, userId));
}

/** 관리자가 한 명뿐이면 그 사람의 권한을 못 내리게 막는다 */
export async function adminCount(): Promise<number> {
  const db = await conn();
  const rows = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.role, "admin"));
  return rows.length;
}

/* ---------- 로그인 시도 제한 ---------- */
/* 같은 메일로 연달아 틀리면 잠깐 막는다. 서버 메모리라 재시작하면 풀린다 —
   혼자 쓰는 앱에는 이 정도가 맞고, 여럿이 쓰게 되면 DB 로 옮긴다. */
const tries = new Map<string, { n: number; until: number }>();
export function throttle(key: string): string | null {
  const t = tries.get(key);
  if (t && t.until > Date.now()) {
    return `너무 여러 번 틀렸습니다. ${Math.ceil((t.until - Date.now()) / 1000)}초 뒤에 다시 시도해 주세요.`;
  }
  return null;
}
export function noteFail(key: string) {
  const t = tries.get(key) ?? { n: 0, until: 0 };
  t.n += 1;
  if (t.n >= 5) { t.until = Date.now() + 60_000; t.n = 0; }
  tries.set(key, t);
}
export function noteOk(key: string) { tries.delete(key); }

export { and };
