/* ============================================================
   Store 의 DB 구현. 인터페이스는 메모리 구현과 똑같다 —
   API 라우트는 어느 쪽이 붙어 있는지 모른다.
   ============================================================ */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { defaultItinerary } from "./itinerary";
import { addMember, canSee as memberCanSee, myTripIds } from "./members";
import { getRegion, guessRegion } from "./regions";
import type { Diary, Expense, Itinerary, Photo, Trip } from "./types";
import type { Draft, DraftItem, Store } from "./store";

const HOME: Trip = {
  id: "everland-1003",
  title: "에버랜드",
  date: "2026-10-03",
  end: "2026-10-03",
  place: "용인 에버랜드",
  people: 4,
  theme: "아이와",
  region: "everland",
  builtin: true,
  createdAt: "2026-09-01T00:00:00.000Z",
};

export class SqlStore implements Store {
  private async conn() {
    const c = getDb();
    if (!c) throw new Error("DATABASE_URL 이 설정되지 않았습니다.");
    await c.ready;
    return c.db;
  }

  /** 기본 여행은 늘 있어야 한다 — 없으면 한 번 넣는다 */
  private async seeded() {
    const db = await this.conn();
    const hit = await db.select().from(schema.trips).where(eq(schema.trips.id, HOME.id)).limit(1);
    if (!hit.length) {
      await db.insert(schema.trips).values(HOME).onConflictDoNothing();
    }
    return db;
  }

  /* ---------- 여행 ----------
     주인이 정해진 여행은 그 사람만 본다. 관리자는 전부 본다.
     user 를 주지 않으면(에이전트 도구 등 서버 내부 호출) 거르지 않는다. */
  async listTrips(viewer?: { id: string; role: string } | null): Promise<Trip[]> {
    const db = await this.seeded();
    const rows = await db.select().from(schema.trips).orderBy(asc(schema.trips.date));
    const all = rows as Trip[];
    /* 로그인 안 한 사람에게는 주인 없는 기본 여행만. 전에는 여기서 전부
       내줬다 — 혼자 쓰던 시절의 줄이다. 미들웨어는 쿠키가 있는지만 보므로
       죽은 세션 쿠키가 남아 있으면 이 길로 들어와 남의 여행 제목·날짜가
       목록에 떴다. 개별 여행은 guardTrip 이 404 로 막고 있었다 */
    if (!viewer) return all.filter((t) => !t.userId);
    if (viewer.role === "admin") return all;
    /* 초대받은 여행도 내 목록에 떠야 한다 — 안 그러면 들어갈 길이 링크뿐이다 */
    const mine = new Set(await myTripIds(viewer.id));
    return all.filter((t) => !t.userId || t.userId === viewer.id || mine.has(t.id));
  }

  /** 이 사람이 이 여행을 볼 수 있는가 — 멤버십까지 본다 (lib/members.ts) */
  async canSee(tripId: string, viewer?: { id: string; role: string } | null) {
    return memberCanSee(tripId, viewer);
  }

  async getTrip(id: string) {
    const db = await this.seeded();
    const r = await db.select().from(schema.trips).where(eq(schema.trips.id, id)).limit(1);
    return (r[0] as Trip) ?? null;
  }

  async createTrip(input: Omit<Trip, "id" | "createdAt" | "region"> & { region?: string | null }) {
    const db = await this.seeded();
    const trip: Trip = {
      ...input,
      region: input.region ?? guessRegion(input.place, input.title),
      id: `trip-${randomUUID().slice(0, 8)}`,
      userId: input.userId ?? null,
      createdAt: new Date().toISOString(),
      builtin: false,
    };
    await db.insert(schema.trips).values(trip);
    /* 만든 사람을 주인 멤버로 넣는다. 이걸 빠뜨리면 사람을 초대할 수 없다 —
       canManage 가 주인 멤버를 찾기 때문이다 */
    if (trip.userId) await addMember(trip.id, trip.userId, "owner");
    return trip;
  }

  async updateTrip(id: string, patch: Partial<Trip>) {
    const db = await this.seeded();
    const cur = await this.getTrip(id);
    if (!cur) return null;
    const { id: _i, createdAt: _c, ...rest } = patch;
    void _i; void _c;
    if (Object.keys(rest).length) {
      await db.update(schema.trips).set(rest).where(eq(schema.trips.id, id));
    }
    return this.getTrip(id);
  }

  async deleteTrip(id: string) {
    const db = await this.seeded();
    const cur = await this.getTrip(id);
    if (!cur || cur.builtin) return false;
    await db.delete(schema.trips).where(eq(schema.trips.id, id));
    return true;
  }

  /* ---------- 일정 ---------- */
  async listItineraries(tripId: string): Promise<Itinerary[]> {
    const db = await this.seeded();
    const rows = await db.select().from(schema.itineraryDays)
      .where(eq(schema.itineraryDays.tripId, tripId))
      .orderBy(asc(schema.itineraryDays.date));
    if (rows.length) return rows as Itinerary[];

    /* 처음이면 첫날에 지역팩 기본 일정을 깔아 둔다. 둘째 날부터는 빈 채로 —
       어디를 갈지는 사람이 정한다 */
    const trip = await this.getTrip(tripId);
    const pack = getRegion(trip?.region);
    if (!trip || !pack) return [];
    const fresh: Itinerary = { ...defaultItinerary(pack, tripId), date: trip.date };
    await db.insert(schema.itineraryDays).values(fresh).onConflictDoNothing();
    return [fresh];
  }

  async getItinerary(tripId: string, date?: string) {
    const all = await this.listItineraries(tripId);
    if (!all.length) return null;
    return date ? all.find((d) => d.date === date) ?? null : all[0];
  }

  async putItinerary(tripId: string, patch: Partial<Itinerary> & { date?: string }) {
    const db = await this.seeded();
    const trip = await this.getTrip(tripId);
    if (!trip) return null;
    const date = patch.date ?? trip.date;
    const all = await this.listItineraries(tripId);
    const cur = all.find((d) => d.date === date);
    /* 그 날이 아직 없으면 빈 하루로 시작한다 — 2일차를 처음 짤 때가 그렇다 */
    const base: Itinerary = cur ?? {
      tripId, date, items: [], start: "09:00", busy: false, cursor: 0, updatedAt: "",
    };
    const next: Itinerary = {
      ...base, ...patch, tripId, date, updatedAt: new Date().toISOString(),
    };
    const set = {
      items: next.items, start: next.start, busy: next.busy,
      cursor: next.cursor, updatedAt: next.updatedAt,
    };
    if (cur) {
      await db.update(schema.itineraryDays).set(set)
        .where(and(eq(schema.itineraryDays.tripId, tripId), eq(schema.itineraryDays.date, date)));
    } else {
      await db.insert(schema.itineraryDays).values(next).onConflictDoNothing();
    }
    return next;
  }

  /* ---------- 사진 ---------- */
  async listPhotos(tripId: string): Promise<Photo[]> {
    const db = await this.seeded();
    const r = await db.select().from(schema.photos)
      .where(eq(schema.photos.tripId, tripId))
      .orderBy(asc(schema.photos.date), asc(schema.photos.takenAt));
    return r as Photo[];
  }

  async addPhoto(tripId: string, p: Omit<Photo, "id" | "tripId">) {
    const db = await this.seeded();
    const row: Photo = { ...p, id: randomUUID().slice(0, 8), tripId };
    await db.insert(schema.photos).values(row);
    return row;
  }

  async updatePhoto(tripId: string, id: string, patch: Partial<Photo>) {
    const db = await this.seeded();
    const { id: _i, tripId: _t, ...rest } = patch;
    void _i; void _t;
    if (Object.keys(rest).length) {
      await db.update(schema.photos).set(rest)
        .where(and(eq(schema.photos.tripId, tripId), eq(schema.photos.id, id)));
    }
    const r = await db.select().from(schema.photos)
      .where(and(eq(schema.photos.tripId, tripId), eq(schema.photos.id, id))).limit(1);
    return (r[0] as Photo) ?? null;
  }

  async deletePhoto(tripId: string, id: string) {
    const db = await this.seeded();
    const r = await db.delete(schema.photos)
      .where(and(eq(schema.photos.tripId, tripId), eq(schema.photos.id, id)));
    return (r.rowsAffected ?? 0) > 0;
  }

  /* ---------- 일기 ----------
     날마다 한 장. (trip_id, date) 가 기본키라 같은 날을 다시 쓰면 덮어쓴다. */
  async getDiary(tripId: string, date: string): Promise<Diary | null> {
    const db = await this.seeded();
    const r = await db.select().from(schema.diaries)
      .where(and(eq(schema.diaries.tripId, tripId), eq(schema.diaries.date, date))).limit(1);
    return (r[0] as Diary) ?? null;
  }

  async listDiaries(tripId: string): Promise<Diary[]> {
    const db = await this.seeded();
    const r = await db.select().from(schema.diaries)
      .where(eq(schema.diaries.tripId, tripId)).orderBy(asc(schema.diaries.date));
    return r as Diary[];
  }

  async putDiary(d: Diary): Promise<Diary> {
    const db = await this.seeded();
    await db.insert(schema.diaries).values(d)
      .onConflictDoUpdate({
        target: [schema.diaries.tripId, schema.diaries.date],
        set: d,
      });
    return d;
  }

  /* ---------- 지출 ---------- */
  async listExpenses(tripId: string): Promise<Expense[]> {
    const db = await this.seeded();
    const r = await db.select().from(schema.expenses)
      .where(eq(schema.expenses.tripId, tripId))
      .orderBy(asc(schema.expenses.date), asc(schema.expenses.at));
    return r as Expense[];
  }

  async addExpense(tripId: string, e: Omit<Expense, "id" | "tripId">) {
    const db = await this.seeded();
    const row: Expense = { ...e, id: randomUUID().slice(0, 8), tripId };
    await db.insert(schema.expenses).values(row);
    return row;
  }

  async updateExpense(tripId: string, id: string, patch: Partial<Expense>) {
    const db = await this.seeded();
    const { id: _i, tripId: _t, ...rest } = patch;
    void _i; void _t;
    if (Object.keys(rest).length) {
      await db.update(schema.expenses).set(rest)
        .where(and(eq(schema.expenses.tripId, tripId), eq(schema.expenses.id, id)));
    }
    const r = await db.select().from(schema.expenses)
      .where(and(eq(schema.expenses.tripId, tripId), eq(schema.expenses.id, id))).limit(1);
    return (r[0] as Expense) ?? null;
  }

  async deleteExpense(tripId: string, id: string) {
    const db = await this.seeded();
    const r = await db.delete(schema.expenses)
      .where(and(eq(schema.expenses.tripId, tripId), eq(schema.expenses.id, id)));
    return (r.rowsAffected ?? 0) > 0;
  }

  /* ---------- 설계 초안 ---------- */
  async getDraft(tripId: string) {
    const db = await this.seeded();
    const r = await db.select().from(schema.drafts)
      .where(eq(schema.drafts.tripId, tripId)).limit(1);
    return r[0] ?? null;
  }

  async putDraft(tripId: string, d: { items: DraftItem[]; tips: string[]; rough?: boolean }): Promise<Draft> {
    const db = await this.seeded();
    const row = { tripId, items: d.items, tips: d.tips, rough: !!d.rough, madeAt: new Date().toISOString() };
    await db.insert(schema.drafts).values(row)
      .onConflictDoUpdate({ target: schema.drafts.tripId, set: row });
    return row;
  }
}
