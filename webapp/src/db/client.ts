/* ============================================================
   DB 연결 — 한 번만 열고 테이블을 보장한다.

     로컬  DATABASE_URL=file:./data/trip.db
     배포  DATABASE_URL=libsql://<db>.turso.io  +  DATABASE_TOKEN

   DATABASE_URL 이 없으면 null 을 돌려주고, store 가 메모리 구현으로 돌아간다.
   ============================================================ */
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

const g = globalThis as unknown as { __db?: { db: DB; client: Client; ready: Promise<void> } };

function open() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  // 파일 DB 면 폴더부터 만든다 — 없으면 열리지 않는다
  if (url.startsWith("file:")) {
    const p = url.slice(5).replace(/^\/\//, "");
    try { mkdirSync(dirname(p), { recursive: true }); } catch { /* 이미 있으면 그만 */ }
  }

  const client = createClient({ url, authToken: process.env.DATABASE_TOKEN });
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

export const hasDb = () => Boolean(process.env.DATABASE_URL);
export { schema };
