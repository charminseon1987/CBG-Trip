/* ============================================================
   테이블 — libSQL(SQLite). 로컬은 파일 하나, 배포는 Turso URL.

   한 여행에 일정 하나, 사진 여럿, 지출 여럿, 설계 초안 하나, 날마다 일기 한 장.
   여행을 지우면 딸린 것도 같이 지워진다 (onDelete: cascade).
   ============================================================ */
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /* scrypt 해시. 평문은 어디에도 남기지 않는다.
     카카오로 들어온 사람은 빈 문자열이다 — verifyPassword 는 "scrypt$…" 꼴이
     아니면 바로 false 를 내므로, 빈 값으로는 비밀번호 로그인이 안 된다. */
  passwordHash: text("password_hash").notNull(),
  /* 카카오가 주는 회원번호. 비밀번호로 가입한 사람은 NULL.
     UNIQUE 라 한 카카오 계정이 두 사람이 될 수 없다. */
  kakaoId: text("kakao_id").unique(),
  role: text("role").notNull().default("member"),      // admin | member
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/* 세션 토큰은 해시해서 넣는다 — DB 가 새도 그 자체로는 로그인에 쓸 수 없다 */
export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),          // epoch ms
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("sessions_user").on(t.userId)]);

export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  date: text("date").notNull(),              // YYYY-MM-DD
  end: text("end").notNull(),
  place: text("place").notNull().default(""),
  people: integer("people").notNull().default(1),
  theme: text("theme").notNull().default("가족"),
  region: text("region"),                    // 지역팩 키 · null 이면 설계 담당
  builtin: integer("builtin", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const itineraries = sqliteTable("itineraries", {
  tripId: text("trip_id").primaryKey()
    .references(() => trips.id, { onDelete: "cascade" }),
  items: text("items", { mode: "json" }).$type<string[]>().notNull(),
  start: text("start").notNull().default("09:00"),
  busy: integer("busy", { mode: "boolean" }).notNull().default(false),
  cursor: integer("cursor").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  url: text("url").notNull(),                // 지금은 data URI · 스토리지를 붙이면 그 키
  date: text("date").notNull(),              // YYYY-MM-DD — 사진 탭이 날짜별로 묶는다
  takenAt: text("taken_at").notNull(),       // HH:MM
  caption: text("caption").notNull().default(""),
  place: text("place"),                      // 그 시각에 있던 일정 블록
  /* 누가 올렸나. 옛 사진은 NULL — 그때는 여행에 한 사람뿐이었다 */
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  /* "private" 나만 · "trip" 같이 간 사람 전부. 기본은 나만 보기 */
  visibility: text("visibility").notNull().default("private"),
}, (t) => [index("photos_trip").on(t.tripId, t.date, t.takenAt)]);

/* ---------- 여행을 같이 하는 사람 ----------

   지금까지는 trips.user_id 한 칸이 전부였다. 그래서 "여행에 여러 사람" 이라는
   개념 자체가 없었다. 여기가 그 바닥이다.

   owner  주인. 여행을 지우고 사람을 들이고 내보낸다
   editor 공동 일정을 고칠 수 있다
   viewer 보기만 한다. 자기 개인 레이어는 고칠 수 있다 (자기 것이니까)       */
export const tripMembers = sqliteTable("trip_members", {
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("editor"),     // owner | editor | viewer
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.tripId, t.userId] }), index("members_user").on(t.userId)]);

/* 아직 안 들어온 사람에게 주는 초대장.

   토큰은 **해시해서** 넣는다 — 세션과 같은 이유다. DB 가 새더라도 그 값만으로는
   남의 여행에 못 들어온다. 링크에 들어가는 원문은 만들 때 한 번만 보여 준다. */
export const tripInvites = sqliteTable("trip_invites", {
  tokenHash: text("token_hash").primaryKey(),
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("editor"),     // 들어오면 가질 권한
  /* 누구에게 보낸 것인지 적어 두면 목록에서 알아보기 쉽다. 검사에는 안 쓴다 —
     카카오로 들어온 사람은 메일이 다를 수 있다 */
  label: text("label").notNull().default(""),
  invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: integer("expires_at").notNull(),         // epoch ms
  usedAt: text("used_at"),                            // 쓴 시각. NULL 이면 아직
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("invites_trip").on(t.tripId)]);

/* 공동 일정 위에 얹는 **개인 레이어**.

   일정 사본을 뜨지 않는 이유: 사본은 그 순간 갈라져서, 주인이 공동 일정을
   고쳐도 친구에게는 영영 안 간다. 대신 "난 여길 빼고 저길 간다" 만 적어 둔다.
   그러면 공동 일정이 바뀌어도 내 수정이 그 위에 그대로 얹힌다.

   dropped  공동 일정에서 뺄 Stop id
   added    공동 일정에 없지만 내가 갈 Stop id (뒤에 붙는다)

   열 이름이 drop·add 가 아닌 까닭: 둘 다 SQL 예약어라 따옴표 없이 쓰면
   CREATE TABLE 이 깨진다. 따옴표로 감싸느니 이름을 피한다.                   */
export const itineraryPersonal = sqliteTable("itinerary_personal", {
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dropped: text("dropped", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  added: text("added", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  start: text("start"),                               // 내 출발 시각. NULL 이면 공동 것
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.tripId, t.userId] })]);

/* 하루치 손글씨 여행일기 — 날마다 한 장 */
export const diaries = sqliteTable("diaries", {
  tripId: text("trip_id").notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  date: text("date").notNull(),              // YYYY-MM-DD
  title: text("title").notNull().default(""),
  mood: text("mood").notNull().default(""),  // 이모지 하나
  opening: text("opening").notNull().default(""),
  stops: text("stops", { mode: "json" })
    .$type<{ time: string; place: string; photoIds: string[]; line: string }[]>()
    .notNull(),
  closing: text("closing").notNull().default(""),
  stickers: text("stickers", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  cover: text("cover"),                      // 표지 사진 id
  memo: text("memo").notNull().default(""),
  by: text("by").notNull().default("rule"),  // model | rule
  madeAt: text("made_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.tripId, t.date] })]);

export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  category: text("category").notNull(),      // ticket car food snack gift etc
  memo: text("memo").notNull().default(""),
  at: text("at").notNull(),                  // HH:MM
  place: text("place"),
}, (t) => [index("expenses_trip").on(t.tripId, t.at)]);

/* 설계 에이전트가 짠 하루 — 지역팩이 없는 여행용 */
export const drafts = sqliteTable("drafts", {
  tripId: text("trip_id").primaryKey()
    .references(() => trips.id, { onDelete: "cascade" }),
  items: text("items", { mode: "json" })
    .$type<{ time: string; name: string; kind: string; minutes?: number; note?: string }[]>()
    .notNull(),
  tips: text("tips", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  rough: integer("rough", { mode: "boolean" }).notNull().default(false),
  madeAt: text("made_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** 마이그레이션 도구 없이도 첫 실행에 테이블이 생기게 한다 */
export const CREATE_SQL = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
     password_hash TEXT NOT NULL, kakao_id TEXT UNIQUE,
     role TEXT NOT NULL DEFAULT 'member',
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS trips (
     id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
     title TEXT NOT NULL, date TEXT NOT NULL, end TEXT NOT NULL,
     place TEXT NOT NULL DEFAULT '', people INTEGER NOT NULL DEFAULT 1,
     theme TEXT NOT NULL DEFAULT '가족', region TEXT,
     builtin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS itineraries (
     trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
     items TEXT NOT NULL, start TEXT NOT NULL DEFAULT '09:00',
     busy INTEGER NOT NULL DEFAULT 0, cursor INTEGER NOT NULL DEFAULT 0,
     updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS photos (
     id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
     url TEXT NOT NULL, date TEXT NOT NULL DEFAULT '', taken_at TEXT NOT NULL,
     caption TEXT NOT NULL DEFAULT '', place TEXT)`,
  `CREATE INDEX IF NOT EXISTS photos_trip ON photos(trip_id, date, taken_at)`,
  `CREATE TABLE IF NOT EXISTS trip_members (
     trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role TEXT NOT NULL DEFAULT 'editor',
     joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (trip_id, user_id))`,
  `CREATE INDEX IF NOT EXISTS members_user ON trip_members(user_id)`,
  `CREATE TABLE IF NOT EXISTS trip_invites (
     token_hash TEXT PRIMARY KEY,
     trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
     role TEXT NOT NULL DEFAULT 'editor', label TEXT NOT NULL DEFAULT '',
     invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
     expires_at INTEGER NOT NULL, used_at TEXT,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS invites_trip ON trip_invites(trip_id)`,
  `CREATE TABLE IF NOT EXISTS itinerary_personal (
     trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     dropped TEXT NOT NULL DEFAULT '[]', added TEXT NOT NULL DEFAULT '[]', start TEXT,
     updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (trip_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS diaries (
     trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
     date TEXT NOT NULL,
     title TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL DEFAULT '',
     opening TEXT NOT NULL DEFAULT '', stops TEXT NOT NULL DEFAULT '[]',
     closing TEXT NOT NULL DEFAULT '', stickers TEXT NOT NULL DEFAULT '[]',
     cover TEXT, memo TEXT NOT NULL DEFAULT '', by TEXT NOT NULL DEFAULT 'rule',
     made_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (trip_id, date))`,
  `CREATE TABLE IF NOT EXISTS expenses (
     id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
     amount INTEGER NOT NULL, category TEXT NOT NULL, memo TEXT NOT NULL DEFAULT '',
     at TEXT NOT NULL, place TEXT)`,
  `CREATE INDEX IF NOT EXISTS expenses_trip ON expenses(trip_id, at)`,
  `CREATE TABLE IF NOT EXISTS drafts (
     trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
     items TEXT NOT NULL, tips TEXT NOT NULL DEFAULT '[]',
     rough INTEGER NOT NULL DEFAULT 0, made_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `PRAGMA foreign_keys = ON`,
];

/* 이미 만들어진 DB 를 쓰던 중이면 빠진 열만 더한다.
   SQLite 는 IF NOT EXISTS 가 없어서 실패를 삼키는 쪽으로 간다. */
export const PATCH_SQL = [
  `ALTER TABLE trips ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE`,
  `ALTER TABLE photos ADD COLUMN date TEXT NOT NULL DEFAULT ''`,
  /* date 열을 더하기 전에 올린 사진은 날짜가 비어 있다. 그대로 두면 사진 탭의
     날짜 띠에도 안 잡히고 그날 일기도 못 만든다 — 여행 첫날로 채운다.
     (ALTER 와 달리 이건 여러 번 돌아도 안전하다) */
  `UPDATE photos SET date = (SELECT date FROM trips WHERE trips.id = photos.trip_id)
     WHERE date IS NULL OR date = ''`,
  /* 카카오 로그인. 쓰던 DB 에는 이 열이 없다.
     SQLite 는 ALTER ADD COLUMN 에 UNIQUE 를 못 붙여서 인덱스로 따로 건다. */
  `ALTER TABLE users ADD COLUMN kakao_id TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_kakao ON users(kakao_id)`,
  /* 사진에 주인과 공개 범위. 쓰던 DB 에는 없다.
     옛 사진은 user_id 가 NULL 인데, 그때는 여행에 한 사람뿐이었다. */
  `ALTER TABLE photos ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE photos ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'`,
  /* 혼자 쓰던 여행의 주인을 멤버로 옮겨 적는다. 이걸 안 하면 자기 여행이
     갑자기 안 보인다 — canSee 가 멤버를 보게 바뀌기 때문이다.
     (ALTER 와 달리 여러 번 돌아도 안전하다) */
  `INSERT OR IGNORE INTO trip_members (trip_id, user_id, role)
     SELECT id, user_id, 'owner' FROM trips WHERE user_id IS NOT NULL`,
  /* 옛 사진은 그 여행 주인이 올린 것으로 본다. 그래야 "내 사진" 에 잡힌다 */
  `UPDATE photos SET user_id = (SELECT user_id FROM trips WHERE trips.id = photos.trip_id)
     WHERE user_id IS NULL`,
];
