/* 비밀번호를 잊었을 때의 탈출구. DB 에 해시를 직접 심는다.

     cd webapp
     echo '새비밀번호' > .env.newpass          # 또는 편집기로 적는다
     node scripts/set-password.mjs             # 기본값 admin@trip.local
     node scripts/set-password.mjs mom@trip.local

   평상시에는 쓸 일이 없다 — 로그인한 사람은 화면에서 바꾼다
   (UserMenu 의 "비밀번호" → PUT /api/auth/password).
   이 길은 **아무도 못 들어갈 때**만 쓴다. 메일로 되찾는 기능이 없기 때문이다.

   평문은 .env.newpass 에서 읽고, 해시만 DB 에 넣고, 그 파일은 지운다.
   화면에 평문을 찍지 않는다. 받는 곳은 .env.turso 의 자격증명이다.    */
import { readFileSync, existsSync, rmSync } from "node:fs";
import { randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createClient } from "@libsql/client";

const scrypt = promisify(_scrypt);
const EMAIL = process.argv[2] || "admin@trip.local";

function env(file) {
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("="); if (i < 0) continue;
    let v = l.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[l.slice(0, i).trim()] ??= v;
  }
}
env(".env.turso");

if (!existsSync(".env.newpass")) { console.error("✖ .env.newpass 가 없습니다."); process.exit(1); }
const plain = readFileSync(".env.newpass", "utf8")
  .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))[0] ?? "";

/* lib/auth.ts 의 checkPasswordStrength 와 같은 규칙 */
const weak =
  plain.length < 10 ? "10자 이상이어야 합니다."
  : /^\d+$/.test(plain) ? "숫자만으로는 안 됩니다."
  : /^(.)\1+$/.test(plain) ? "같은 글자만 반복할 수 없습니다."
  : ["password", "12345678", "qwerty", "admin123", "비밀번호"].some((c) => plain.toLowerCase().includes(c))
      ? "너무 흔한 비밀번호입니다." : null;
if (weak) { console.error(`✖ ${weak} (.env.newpass 를 고치고 다시 돌리세요)`); process.exit(1); }

/* lib/auth.ts 의 hashPassword 와 같은 꼴: scrypt$<salt>$<key> */
const salt = randomBytes(16).toString("base64url");
const key = await scrypt(plain, salt, 64);
const stored = `scrypt$${salt}$${key.toString("base64url")}`;

const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const r = await c.execute({ sql: "update users set password_hash = ? where email = ?", args: [stored, EMAIL] });
console.log(`${EMAIL} — 고친 행 ${r.rowsAffected}개`);
if (r.rowsAffected !== 1) { console.error("✖ 1행이 아닙니다. 아무것도 믿지 마세요."); process.exit(1); }

rmSync(".env.newpass", { force: true });
console.log("비밀번호를 심었습니다. .env.newpass 는 지웠습니다.");
console.log("https://cbg-trip.vercel.app/login 에서 들어가세요.");
