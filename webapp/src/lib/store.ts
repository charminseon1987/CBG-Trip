/* ============================================================
   저장소 — 지금은 프로세스 메모리. DB 자리.

   Store 인터페이스만 지키면 나중에 Postgres/Drizzle, Supabase, Mongo 무엇으로든
   갈아 끼울 수 있다. API 라우트는 이 인터페이스만 보고, 구현을 모른다.

   주의: 메모리라서 서버가 재시작하거나 서버리스 인스턴스가 바뀌면 날아간다.
   개발/데모용이고, DB를 붙이기 전까지만 쓴다.
   ============================================================ */
import { randomUUID } from "node:crypto";
import { defaultItinerary } from "./itinerary";
import { hasDb } from "@/db/client";
import { SqlStore } from "./store-sql";
import { getRegion, guessRegion } from "./regions";
import type { Diary, Expense, Itinerary, Photo, Trip } from "./types";

export interface Store {
  listTrips(viewer?: { id: string; role: string } | null): Promise<Trip[]>;
  canSee?(tripId: string, viewer?: { id: string; role: string } | null): Promise<boolean>;
  getTrip(id: string): Promise<Trip | null>;
  createTrip(input: Omit<Trip, "id" | "createdAt" | "region"> & { region?: string | null; userId?: string | null }): Promise<Trip>;
  updateTrip(id: string, patch: Partial<Trip>): Promise<Trip | null>;
  deleteTrip(id: string): Promise<boolean>;

  /** 여행의 모든 날. 날짜 순 */
  listItineraries(tripId: string): Promise<Itinerary[]>;
  /** 하루. 날짜를 안 주면 첫날 */
  getItinerary(tripId: string, date?: string): Promise<Itinerary | null>;
  /** 하루를 덮어쓴다. 그 날이 없으면 만든다 */
  putItinerary(tripId: string, it: Partial<Itinerary> & { date?: string }): Promise<Itinerary | null>;

  listPhotos(tripId: string): Promise<Photo[]>;
  addPhoto(tripId: string, p: Omit<Photo, "id" | "tripId">): Promise<Photo>;
  updatePhoto(tripId: string, id: string, patch: Partial<Pick<Photo, "caption" | "date" | "takenAt" | "place">>): Promise<Photo | null>;
  deletePhoto(tripId: string, id: string): Promise<boolean>;

  getDiary(tripId: string, date: string): Promise<Diary | null>;
  listDiaries(tripId: string): Promise<Diary[]>;
  putDiary(d: Diary): Promise<Diary>;

  listExpenses(tripId: string): Promise<Expense[]>;
  addExpense(tripId: string, e: Omit<Expense, "id" | "tripId">): Promise<Expense>;
  updateExpense(tripId: string, id: string, patch: Partial<Expense>): Promise<Expense | null>;
  deleteExpense(tripId: string, id: string): Promise<boolean>;

  /* 설계 에이전트가 짠 하루 */
  getDraft(tripId: string): Promise<Draft | null>;
  putDraft(tripId: string, d: { items: DraftItem[]; tips: string[]; rough?: boolean }): Promise<Draft>;
}

export interface DraftItem {
  time: string; name: string; kind: string; minutes?: number; note?: string;
}
export interface Draft {
  tripId: string; items: DraftItem[]; tips: string[]; rough: boolean; madeAt: string;
}

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

class MemoryStore implements Store {
  private trips = new Map<string, Trip>([[HOME.id, HOME]]);
  /* 여행 하나에 날마다 한 줄 */
  private itineraries = new Map<string, Itinerary[]>();
  private photos = new Map<string, Photo[]>();
  private expenses = new Map<string, Expense[]>();
  private diaries = new Map<string, Diary>();   // key: `${tripId}:${date}`

  async listTrips(viewer?: { id: string; role: string } | null) {
    const all = [...this.trips.values()].sort((a, b) => a.date.localeCompare(b.date));
    /* 로그인 안 한 사람에게는 주인 없는 기본 여행만. 전에는 여기서 전부
       내줬다 — 혼자 쓰던 시절의 줄이다. 미들웨어는 쿠키가 있는지만 보므로
       죽은 세션 쿠키가 남아 있으면 이 길로 들어와 남의 여행 제목·날짜가
       목록에 떴다. 개별 여행은 guardTrip 이 404 로 막고 있었다 */
    if (!viewer) return all.filter((t) => !t.userId);
    if (viewer.role === "admin") return all;
    return all.filter((t) => !t.userId || t.userId === viewer.id);
  }
  async canSee(tripId: string, viewer?: { id: string; role: string } | null) {
    const t = this.trips.get(tripId);
    if (!t) return false;
    if (!viewer || viewer.role === "admin") return true;
    return !t.userId || t.userId === viewer.id;
  }
  async getTrip(id: string) {
    return this.trips.get(id) ?? null;
  }
  async createTrip(input: Omit<Trip, "id" | "createdAt" | "region"> & { region?: string | null; userId?: string | null }) {
    const region = input.region ?? guessRegion(input.place, input.title);
    const trip: Trip = {
      ...input,
      region,
      id: `trip-${randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
    };
    this.trips.set(trip.id, trip);
    return trip;
  }
  async updateTrip(id: string, patch: Partial<Trip>) {
    const t = this.trips.get(id);
    if (!t) return null;
    const next = { ...t, ...patch, id: t.id, createdAt: t.createdAt };
    this.trips.set(id, next);
    return next;
  }
  async deleteTrip(id: string) {
    const t = this.trips.get(id);
    if (!t || t.builtin) return false;
    this.trips.delete(id);
    this.itineraries.delete(id);
    this.photos.delete(id);
    this.expenses.delete(id);
    for (const k of [...this.diaries.keys()]) if (k.startsWith(`${id}:`)) this.diaries.delete(k);
    return true;
  }

  async listItineraries(tripId: string) {
    const hit = this.itineraries.get(tripId);
    if (hit?.length) return [...hit].sort((a, b) => a.date.localeCompare(b.date));
    const trip = this.trips.get(tripId);
    const pack = getRegion(trip?.region);
    if (!trip || !pack) return [];
    /* 첫날만 지역팩 기본 일정으로 깔아 둔다. 둘째 날부터는 빈 채로 둔다 —
       어디를 갈지는 사람이 정한다 */
    const fresh: Itinerary = { ...defaultItinerary(pack, tripId), date: trip.date };
    this.itineraries.set(tripId, [fresh]);
    return [fresh];
  }
  async getItinerary(tripId: string, date?: string) {
    const all = await this.listItineraries(tripId);
    if (!all.length) return null;
    return date ? all.find((d) => d.date === date) ?? null : all[0];
  }
  async putItinerary(tripId: string, patch: Partial<Itinerary> & { date?: string }) {
    const trip = this.trips.get(tripId);
    if (!trip) return null;
    const date = patch.date ?? trip.date;
    const all = await this.listItineraries(tripId);
    const cur = all.find((d) => d.date === date);
    const base: Itinerary = cur ?? {
      tripId, date, items: [], start: "09:00", busy: false, cursor: 0, updatedAt: "",
    };
    const next: Itinerary = {
      ...base, ...patch, tripId, date, updatedAt: new Date().toISOString(),
    };
    this.itineraries.set(tripId, [...all.filter((d) => d.date !== date), next]);
    return next;
  }

  async listPhotos(tripId: string) {
    return (this.photos.get(tripId) ?? [])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.takenAt.localeCompare(b.takenAt));
  }
  async addPhoto(tripId: string, p: Omit<Photo, "id" | "tripId">) {
    const photo: Photo = { ...p, id: randomUUID().slice(0, 8), tripId };
    this.photos.set(tripId, [...(this.photos.get(tripId) ?? []), photo]);
    return photo;
  }
  async updatePhoto(tripId: string, id: string, patch: Partial<Pick<Photo, "caption" | "date" | "takenAt" | "place">>) {
    const list = this.photos.get(tripId) ?? [];
    const i = list.findIndex((p) => p.id === id);
    if (i < 0) return null;
    const next = { ...list[i], ...patch, id, tripId };
    this.photos.set(tripId, list.map((p, j) => (j === i ? next : p)));
    return next;
  }
  async deletePhoto(tripId: string, id: string) {
    const list = this.photos.get(tripId) ?? [];
    const next = list.filter((p) => p.id !== id);
    this.photos.set(tripId, next);
    return next.length !== list.length;
  }

  async getDiary(tripId: string, date: string) {
    return this.diaries.get(`${tripId}:${date}`) ?? null;
  }
  async listDiaries(tripId: string) {
    return [...this.diaries.values()]
      .filter((d) => d.tripId === tripId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  async putDiary(d: Diary) {
    this.diaries.set(`${d.tripId}:${d.date}`, d);
    return d;
  }

  async listExpenses(tripId: string) {
    return (this.expenses.get(tripId) ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
  }
  async addExpense(tripId: string, e: Omit<Expense, "id" | "tripId">) {
    const row: Expense = { ...e, id: randomUUID().slice(0, 8), tripId };
    this.expenses.set(tripId, [...(this.expenses.get(tripId) ?? []), row]);
    return row;
  }
  async updateExpense(tripId: string, id: string, patch: Partial<Expense>) {
    const hit = (this.expenses.get(tripId) ?? []).find((x) => x.id === id);
    if (!hit) return null;
    Object.assign(hit, patch, { id, tripId });
    return hit;
  }
  async deleteExpense(tripId: string, id: string) {
    const list = this.expenses.get(tripId) ?? [];
    const next = list.filter((x) => x.id !== id);
    this.expenses.set(tripId, next);
    return next.length !== list.length;
  }

  private drafts = new Map<string, Draft>();
  async getDraft(tripId: string) { return this.drafts.get(tripId) ?? null; }
  async putDraft(tripId: string, d: { items: DraftItem[]; tips: string[]; rough?: boolean }) {
    const row: Draft = { tripId, items: d.items, tips: d.tips, rough: !!d.rough, madeAt: new Date().toISOString() };
    this.drafts.set(tripId, row);
    return row;
  }
}

/* DB 주소가 있으면 DB, 없으면 메모리.
   어떤 이름으로 들어왔는지는 hasDb() 가 안다 (db/client.ts — 마켓플레이스가
   넣어 주는 TURSO_* 도 인정한다). 여기서 process.env 를 직접 보면 안 된다:
   배포에서 조용히 메모리 구현으로 떨어져 로그인도 여행도 사라진다.
   개발 중 핫리로드로 저장소가 날아가지 않게 전역에 붙여 둔다. */
const g = globalThis as unknown as { __store?: Store };

function pick(): Store {
  return hasDb() ? new SqlStore() : new MemoryStore();
}

export const store: Store = g.__store ?? (g.__store = pick());
export const storeKind = () => (hasDb() ? "libsql" : "memory");
