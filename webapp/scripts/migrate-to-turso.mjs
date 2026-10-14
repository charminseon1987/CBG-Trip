#!/usr/bin/env node
/* ============================================================
   로컬 파일 DB(webapp/data/trip.db) 를 Turso 로 옮긴다.

     node scripts/migrate-to-turso.mjs                  # 아무것도 안 쓴다. 옮길 것만 보여준다
     node scripts/migrate-to-turso.mjs --apply          # 실제로 옮긴다
     node scripts/migrate-to-turso.mjs --apply --photos=blob   # data URI 사진을 Blob 에 올린다
     node scripts/migrate-to-turso.mjs --apply --replace       # 이미 있는 행도 덮어쓴다

   기본은 **마른 실행(dry run)** 이다. --apply 를 붙이지 않으면 한 줄도 쓰지 않는다.
   여러 번 돌려도 안전하다 — INSERT OR IGNORE 라 이미 간 행은 건드리지 않는다.
   (--replace 는 예외다. 받는 쪽에서 고친 내용을 로컬 값으로 되돌린다)

   --replace 를 INSERT OR REPLACE 로 쓰면 안 된다. 그건 같은 기본키를 만나면
   **기존 행을 지우고** 다시 넣는데, 외래키가 ON DELETE CASCADE 라서 여행 한 줄을
   덮는 순간 그 여행의 일정·사진·일기·지출이 같이 지워진다 (users 를 덮으면 그
   사람의 여행 전체가 날아간다). 로컬에 없고 받는 쪽에만 있던 사진이 조용히
   사라지는 길이다. 그래서 지우지 않는 ON CONFLICT ... DO UPDATE 로 간다.

   테이블은 받는 쪽에 만들어 준다. DDL 을 손으로 적지 않고 **보내는 쪽
   sqlite_master 에서 그대로 읽는다** — schema.ts 의 CREATE_SQL·PATCH_SQL 이
   실제로 만들어 놓은 모양이라, 여기 베껴 두면 생기는 엇갈림이 없다.

   세션은 옮기지 않는다 (로그인 토큰 — 옮길 이유가 없고, 새로 로그인하면 된다).
   정말 옮기려면 --sessions.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@libsql/client";

/* ---------- 인자 ---------- */
const ARGV = process.argv.slice(2);
const has = (n) => ARGV.includes(`--${n}`);
const opt = (n, dflt) => {
  const hit = ARGV.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : dflt;
};

const APPLY = has("apply");
const REPLACE = has("replace");
const WITH_SESSIONS = has("sessions");
const PHOTOS = opt("photos", "keep");          // keep | blob
const SRC_URL = opt("from", "file:./data/trip.db");
/* 받는 쪽 값이 담긴 파일. 배포 값은 Development 환경에 없어서 이렇게 받아야 한다:
     vercel env pull .env.production.local --environment=production   */
const ENV_FILE = opt("env", ".env.local");

/* 여행 → 딸린 것 순서. 참조가 걸려 있어 이 순서를 지켜야 한다 */
const ORDER = ["users", "trips", "itineraries", "photos", "diaries", "expenses", "drafts"];

/* ---------- .env.local 읽기 ---------- */
/* vercel env pull 이 내려 준 파일. dotenv 를 안 쓰므로 직접 읽는다.
   이미 환경에 있는 값은 덮지 않는다 — 셸에서 준 쪽이 이긴다. */
function loadEnv(file) {
  if (!existsSync(file)) return false;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
  return true;
}

const died = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

/* ---------- 사진: data URI → Blob ---------- */
const DATA_URI = /^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s;
const EXT = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "image/heic": "heic", "image/avif": "avif",
};

/** lib/blob.ts 의 storePhoto 와 같은 규칙. 여기서 import 할 수 없어(TS) 옮겨 적었다 */
async function toBlob(put, token, tripId, url) {
  const m = DATA_URI.exec(url);
  if (!m) return url;                                   // http 주소거나 알 수 없는 꼴 — 그대로
  const bytes = Buffer.from(m[2], "base64");
  const ext = EXT[m[1]] ?? "bin";
  const { url: stored } = await put(`trips/${tripId}/${Date.now()}.${ext}`, bytes, {
    access: "public", contentType: m[1], addRandomSuffix: true, token,
  });
  return stored;
}

/* ---------- 본체 ---------- */
async function main() {
  loadEnv(ENV_FILE);

  /* 이름이 두 벌인 이유는 src/db/client.ts 머리말과 같다 —
     마켓플레이스로 붙인 Turso 는 TURSO_* 로 들어온다 */
  const dstUrl = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
  const dstToken = process.env.DATABASE_TOKEN || process.env.TURSO_AUTH_TOKEN;
  if (!dstUrl) {
    died([
      `받는 쪽 주소가 없습니다 (${ENV_FILE} 에 DATABASE_URL 도 TURSO_DATABASE_URL 도 없습니다).`,
      "배포 값을 받아 오세요 — Development 환경에는 안 들어 있습니다:",
      "    cd webapp && vercel env pull .env.production.local --environment=production",
      "    node scripts/migrate-to-turso.mjs --env=.env.production.local",
      "(DEPLOY.md 1단계 — 저장소를 먼저 붙여야 합니다)",
    ].join("\n"));
  }
  if (dstUrl === SRC_URL) died(`보내는 곳과 받는 곳이 같습니다: ${dstUrl}`);

  const srcFile = SRC_URL.startsWith("file:") ? SRC_URL.slice(5).replace(/^\/\//, "") : null;
  if (srcFile && !existsSync(srcFile)) died(`보낼 DB 가 없습니다: ${srcFile}`);

  const src = createClient({ url: SRC_URL });
  const dst = createClient({ url: dstUrl, authToken: dstToken });

  console.log(`\n보낼 곳  ${SRC_URL}`);
  console.log(`받을 곳  ${dstUrl}`);
  if (!dstUrl.startsWith("libsql:") && !dstUrl.startsWith("https:")) {
    console.log("         (Turso 주소가 아닙니다 — 시험용 파일 DB 로 봅니다)");
  }
  console.log(APPLY ? "\n▶ 실제로 씁니다." : "\n▶ 마른 실행입니다. 한 줄도 쓰지 않습니다 (--apply 로 진짜 실행).");

  /* 1. 테이블 — 보내는 쪽 DDL 을 그대로 받는 쪽에 만든다 */
  const ddl = await src.execute(
    "select type, name, sql from sqlite_master " +
    "where sql is not null and name not like 'sqlite_%' order by (type='index'), name",
  );
  const stmts = ddl.rows.map((r) =>
    String(r.sql)
      .replace(/^CREATE TABLE /i, "CREATE TABLE IF NOT EXISTS ")
      .replace(/^CREATE INDEX /i, "CREATE INDEX IF NOT EXISTS ")
      .replace(/^CREATE UNIQUE INDEX /i, "CREATE UNIQUE INDEX IF NOT EXISTS "),
  );
  if (APPLY) {
    for (const q of stmts) await dst.execute(q);
    console.log(`\n테이블·인덱스 ${stmts.length}개 보장했습니다.`);
  } else {
    console.log(`\n테이블·인덱스 ${stmts.length}개를 만들 예정입니다 (${ddl.rows.map((r) => r.name).join(", ")})`);
  }

  /* 2. 행 옮기기 */
  const tables = WITH_SESSIONS ? [...ORDER, "sessions"] : ORDER;

  /* 받는 쪽 행 수는 옮기기 **전에** 다 세어 둔다 — 앞 테이블을 넣은 뒤에 세면
     보고가 어긋난다 */
  const beforeN = {};
  for (const t of tables) {
    const got = await dst.execute(`select count(*) as n from "${t}"`).catch(() => null);
    beforeN[t] = Number(got?.rows[0]?.n ?? 0);
  }

  let put = null, blobToken = "";
  if (PHOTOS === "blob") {
    blobToken = process.env.BLOB_READ_WRITE_TOKEN || "";
    if (!blobToken) died("--photos=blob 인데 BLOB_READ_WRITE_TOKEN 이 없습니다. Blob 을 먼저 붙이세요.");
    ({ put } = await import("@vercel/blob"));
  }

  const report = [];
  for (const table of tables) {
    const rows = (await src.execute(`select * from "${table}"`)).rows;
    const before = beforeN[table];

    if (!rows.length) { report.push([table, 0, before, 0, ""]); continue; }

    /* 양쪽에 다 있는 열만 옮긴다 — 한쪽에 빠진 열이 있어도 멈추지 않게 */
    const srcCols = Object.keys(rows[0]);
    const info = (await dst.execute(`PRAGMA table_info("${table}")`)).rows;
    const dstCols = new Set(info.map((r) => String(r.name)));
    /* 기본키 — ON CONFLICT 의 대상. diaries 처럼 두 열인 것도 있다 */
    const pk = info.filter((r) => Number(r.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((r) => String(r.name));
    /* 마른 실행이면 받는 쪽에 테이블이 아직 없다 — 열이 비어 나오는 것은
       "없는 열"이 아니라 "만들 예정"이다. 그 경우는 보내는 쪽 열을 그대로 쓴다. */
    const fresh = dstCols.size === 0;
    const cols = fresh ? srcCols : srcCols.filter((c) => dstCols.has(c));
    const dropped = fresh ? [] : srcCols.filter((c) => !dstCols.has(c));

    /* 사진은 옮기기 전에 Blob 으로 보낸다 */
    let uploaded = 0, uploadBytes = 0;
    if (table === "photos") {
      for (const r of rows) {
        const m = DATA_URI.exec(String(r.url ?? ""));
        if (!m) continue;
        uploadBytes += Buffer.byteLength(m[2], "base64");
        if (put && APPLY) {
          r.url = await toBlob(put, blobToken, String(r.trip_id), String(r.url));
          uploaded += 1;
        } else if (put) {
          uploaded += 1;                               // 마른 실행 — 셈만 한다
        }
      }
    }

    let wrote = 0;
    if (APPLY) {
      const head = `INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) ` +
        `VALUES (${cols.map(() => "?").join(", ")})`;
      /* 덮어쓰기는 지우지 않는 upsert 로 — 위 머리말에 적은 cascade 때문이다.
         기본키를 못 찾으면(있을 리 없지만) 덮지 않고 건너뛰는 쪽으로 간다. */
      const set = cols.filter((c) => !pk.includes(c)).map((c) => `"${c}"=excluded."${c}"`).join(", ");
      const sql = REPLACE && pk.length && set
        ? `INSERT ${head} ON CONFLICT(${pk.map((c) => `"${c}"`).join(", ")}) DO UPDATE SET ${set}`
        : `INSERT OR IGNORE ${head}`;
      const batch = rows.map((r) => ({ sql, args: cols.map((c) => r[c] ?? null) }));
      const res = await dst.batch(batch, "write");
      wrote = res.reduce((n, r) => n + Number(r.rowsAffected ?? 0), 0);
    }

    const note = [
      dropped.length ? `받는 쪽에 없는 열 건너뜀: ${dropped.join(", ")}` : "",
      table === "photos" && uploaded ? `data URI ${uploaded}장 → Blob (${(uploadBytes / 1024).toFixed(0)}KB)` : "",
      table === "photos" && !put && rows.some((r) => DATA_URI.test(String(r.url ?? "")))
        ? "data URI 를 그대로 옮깁니다 (--photos=blob 로 올릴 수 있습니다)" : "",
    ].filter(Boolean).join(" · ");

    report.push([table, rows.length, before, wrote, note]);
  }

  /* 3. 표 ---------- */
  console.log("");
  console.log("테이블        보낼 행  받는 쪽(전)  넣음");
  console.log("────────────────────────────────────────");
  for (const [t, n, before, wrote, note] of report) {
    console.log(`${t.padEnd(13)}${String(n).padStart(7)}${String(before).padStart(13)}${String(APPLY ? wrote : "-").padStart(6)}`);
    if (note) console.log(`              ↳ ${note}`);
  }

  if (!APPLY) {
    console.log("\n마른 실행이었습니다. 진짜로 옮기려면:");
    console.log("    node scripts/migrate-to-turso.mjs --apply" + (PHOTOS === "blob" ? " --photos=blob" : ""));
    return;
  }

  /* 4. 옮긴 뒤 받는 쪽을 세어 본다 */
  console.log("\n받는 쪽 최종:");
  for (const [t] of report) {
    const n = (await dst.execute(`select count(*) as n from "${t}"`)).rows[0].n;
    console.log(`  ${t.padEnd(13)}${String(n).padStart(5)}`);
  }
  const skipped = report.reduce((n, [, srcN, , wrote]) => n + (srcN - wrote), 0);
  if (skipped > 0 && !REPLACE) {
    console.log(`\n이미 있어서 건너뛴 행 ${skipped}개. 로컬 값으로 덮어쓰려면 --replace.`);
  }
  console.log("\n끝났습니다. 세션은 옮기지 않았으니 배포한 주소에서 새로 로그인하세요.");
}

main().catch((e) => died(e instanceof Error ? e.stack ?? e.message : String(e)));
