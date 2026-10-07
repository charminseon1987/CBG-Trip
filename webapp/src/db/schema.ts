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
  /* scrypt 해시. 평문은 어디에도 남기지 않는다 */
  passwordHash: text("password_hash").notNull(),
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
}, (t) => [index("photos_trip").on(t.tripId, t.date, t.takenAt)]);

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
     password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
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
];
