/* 로컬 파일 DB 의 비밀번호를 다시 심는다.

     cd webapp
     node scripts/set-local-password.mjs admin@trip.local '새비밀번호'

   형제 스크립트 set-password.mjs 는 .env.turso 를 읽어 **배포 DB** 를 고친다.
   이쪽은 .env.local 의 DATABASE_URL 이 file: 일 때만 돈다 — 로컬과 Turso 는
   서로 다른 DB 라서, 한쪽에서 바꾼 비밀번호가 다른 쪽에서는 안 듣는다.
   (그 둘을 혼동해 "비밀번호가 맞는데 401" 을 한참 들여다봤다)

   평문은 인수로만 받고 화면에 찍지 않으며 어디에도 저장하지 않는다.
   해시만 DB 에 들어간다. 로그인한 사람은 이 길이 아니라 화면에서 바꾼다
   (UserMenu 의 "비밀번호" → PUT /api/auth/password). */
import { readFileSync } from "node:fs";
import { randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createClient } from "@libsql/client";

const scrypt = promisify(_scrypt);
const KEYLEN = 64; // src/lib/auth.ts 와 같아야 한다

const email = (process.argv[2] || "").trim().toLowerCase();
const plain = process.argv[3] || "";
if (!email || !plain) {
  console.error("쓰는 법: node scripts/set-local-password.mjs <메일> <새비밀번호>");
  process.exit(1);
}
if (plain.length < 10) {
  console.error("비밀번호는 10자 이상이어야 합니다 (앱의 규칙과 같게).");
  process.exit(1);
}

/* .env.local 에서 DATABASE_URL 만 집어 온다 */
let url = "";
for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const l = raw.trim();
  if (!l || l.startsWith("#")) continue;
  const i = l.indexOf("=");
  if (i > 0 && l.slice(0, i).trim() === "DATABASE_URL") url = l.slice(i + 1).trim();
}
if (!url.startsWith("file:")) {
  console.error(`로컬 파일 DB 가 아니라 멈춥니다 (DATABASE_URL 이 "${url.split(":")[0]}:" 로 시작).`);
  console.error("배포 DB 는 scripts/set-password.mjs 로 바꿉니다.");
  process.exit(1);
}

const db = createClient({ url });
const salt = randomBytes(16).toString("base64url");
const key = (await scrypt(plain, salt, KEYLEN)).toString("base64url");
const r = await db.execute({
  sql: "update users set password_hash = ? where email = ?",
  args: [`scrypt$${salt}$${key}`, email],
});
if (!r.rowsAffected) {
  console.error(`${email} 이라는 사람이 이 DB 에 없습니다.`);
  process.exit(1);
}
console.log(`${email} 의 비밀번호를 다시 심었습니다 (${url}).`);
