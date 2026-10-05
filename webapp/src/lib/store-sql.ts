/* ============================================================
   Store 의 DB 구현. 인터페이스는 메모리 구현과 똑같다 —
   API 라우트는 어느 쪽이 붙어 있는지 모른다.
   ============================================================ */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { defaultItinerary } from "./itinerary";
import { getRegion, guessRegion } from "./regions";
import type { Expense, Itinerary, Photo, Trip } from "./types";
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
    if (!viewer || viewer.role === "admin") return all;
    return all.filter((t) => !t.userId || t.userId === viewer.id);
  }

  /** 이 사람이 이 여행을 볼 수 있는가 */
  async canSee(tripId: string, viewer?: { id: string; role: string } | null) {
    const t = await this.getTrip(tripId);
    if (!t) return false;
    if (!viewer || viewer.role === "admin") return true;
    return !t.userId || t.userId === viewer.id;
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
  async getItinerary(tripId: string) {
    const db = await this.seeded();
    const r = await db.select().from(schema.itineraries)
      .where(eq(schema.itineraries.tripId, tripId)).limit(1);
    if (r[0]) return r[0] as Itinerary;

    // 없으면 지역팩의 기본 일정으로 한 번 만든다
    const trip = await this.getTrip(tripId);
    const pack = getRegion(trip?.region);
    if (!trip || !pack) return null;
    const fresh = defaultItinerary(pack, tripId);
    await db.insert(schema.itineraries).values(fresh).onConflictDoNothing();
    return fresh;
  }

  async putItinerary(tripId: string, patch: Partial<Itinerary>) {
    const db = await this.seeded();
    const cur = await this.getItinerary(tripId);
    if (!cur) return null;
    const next: Itinerary = { ...cur, ...patch, tripId, updatedAt: new Date().toISOString() };
    await db.update(schema.itineraries)
      .set({ items: next.items, start: next.start, busy: next.busy, cursor: next.cursor, updatedAt: next.updatedAt })
      .where(eq(schema.itineraries.tripId, tripId));
    return next;
  }

  /* ---------- 사진 ---------- */
  async listPhotos(tripId: string): Promise<Photo[]> {
    const db = await this.seeded();
    const r = await db.select().from(schema.photos)
      .where(eq(schema.photos.tripId, tripId)).orderBy(asc(schema.photos.takenAt));
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

  /* ---------- 지출 ---------- */
  async listExpenses(tripId: string): Promise<Expense[]> {
    const db = await this.seeded();
    const r = await db.select().from(schema.expenses)
      .where(eq(schema.expenses.tripId, tripId)).orderBy(asc(schema.expenses.at));
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
