/* ============================================================
   DB 연결 — 한 번만 열고 테이블을 보장한다.

     로컬  DATABASE_URL=file:./data/trip.db
     배포  DATABASE_URL=libsql://<db>.turso.io  +  DATABASE_TOKEN

   주소가 없으면 null 을 돌려주고, store 가 메모리 구현으로 돌아간다.

   이름이 두 벌인 이유: Turso 를 Vercel 마켓플레이스로 붙이면 변수가
   TURSO_DATABASE_URL·TURSO_AUTH_TOKEN 으로 들어온다. 같은 값을 DATABASE_URL 로
   한 번 더 복사해 두면 비밀이 두 군데 생기고 한쪽만 바꿔 어긋난다 —
   그래서 양쪽 이름을 다 읽는다. 우리가 적은 이름이 이긴다.
   ============================================================ */
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

const g = globalThis as unknown as { __db?: { db: DB; client: Client; ready: Promise<void> } };

/** DB 주소. 우리가 적은 이름 → 마켓플레이스가 넣어 준 이름 순서로 본다 */
export const dbUrl = () => process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "";
/** DB 토큰. 파일 DB 는 토큰이 없다 */
export const dbToken = () =>
  process.env.DATABASE_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;

function open() {
  const url = dbUrl();
  if (!url) return null;

  // 파일 DB 면 폴더부터 만든다 — 없으면 열리지 않는다
  if (url.startsWith("file:")) {
    const p = url.slice(5).replace(/^\/\//, "");
    try { mkdirSync(dirname(p), { recursive: true }); } catch { /* 이미 있으면 그만 */ }
  }

  const client = createClient({ url, authToken: dbToken() });
  const db = drizzle(client, { schema });

  /* 마이그레이션 파일 없이 첫 실행에 테이블을 만든다.
     스키마가 단순하고 혼자 쓰는 앱이라 이 정도로 충분하다. */
  const ready = (async () => {
    for (const q of schema.CREATE_SQL) await client.execute(q);
    // 쓰던 DB 에 빠진 열이 있으면 더한다. 이미 있으면 에러가 나는데 그건 정상이다.
    for (const q of schema.PATCH_SQL) {
      await client.execute(q).catch(() => { /* 이미 있음 */ });
    }
  })();

  return { db, client, ready };
}

export function getDb(): { db: DB; ready: Promise<void> } | null {
  if (!g.__db) {
    const made = open();
    if (!made) return null;
    g.__db = made;
  }
  return { db: g.__db.db, ready: g.__db.ready };
}

export const hasDb = () => Boolean(dbUrl());
export { schema };
