/* ============================================================
   저장소 — 지금은 프로세스 메모리. DB 자리.

   Store 인터페이스만 지키면 나중에 Postgres/Drizzle, Supabase, Mongo 무엇으로든
   갈아 끼울 수 있다. API 라우트는 이 인터페이스만 보고, 구현을 모른다.

   주의: 메모리라서 서버가 재시작하거나 서버리스 인스턴스가 바뀌면 날아간다.
   개발/데모용이고, DB를 붙이기 전까지만 쓴다.
   ============================================================ */
import { randomUUID } from "node:crypto";
import { defaultItinerary } from "./itinerary";
import { getRegion, guessRegion } from "./regions";
import type { Expense, Itinerary, Photo, Trip } from "./types";

export interface Store {
  listTrips(): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | null>;
  createTrip(input: Omit<Trip, "id" | "createdAt" | "region"> & { region?: string | null }): Promise<Trip>;
  updateTrip(id: string, patch: Partial<Trip>): Promise<Trip | null>;
  deleteTrip(id: string): Promise<boolean>;

  getItinerary(tripId: string): Promise<Itinerary | null>;
  putItinerary(tripId: string, it: Partial<Itinerary>): Promise<Itinerary | null>;

  listPhotos(tripId: string): Promise<Photo[]>;
  addPhoto(tripId: string, p: Omit<Photo, "id" | "tripId">): Promise<Photo>;
  deletePhoto(tripId: string, id: string): Promise<boolean>;

  listExpenses(tripId: string): Promise<Expense[]>;
  addExpense(tripId: string, e: Omit<Expense, "id" | "tripId">): Promise<Expense>;
  deleteExpense(tripId: string, id: string): Promise<boolean>;
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
  private itineraries = new Map<string, Itinerary>();
  private photos = new Map<string, Photo[]>();
  private expenses = new Map<string, Expense[]>();

  async listTrips() {
    return [...this.trips.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  async getTrip(id: string) {
    return this.trips.get(id) ?? null;
  }
  async createTrip(input: Omit<Trip, "id" | "createdAt" | "region"> & { region?: string | null }) {
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
    return true;
  }

  async getItinerary(tripId: string) {
    const hit = this.itineraries.get(tripId);
    if (hit) return hit;
    const trip = this.trips.get(tripId);
    const pack = getRegion(trip?.region);
    if (!trip || !pack) return null;
    const fresh = defaultItinerary(pack, tripId);
    this.itineraries.set(tripId, fresh);
    return fresh;
  }
  async putItinerary(tripId: string, patch: Partial<Itinerary>) {
    const cur = await this.getItinerary(tripId);
    if (!cur) return null;
    const next: Itinerary = {
      ...cur, ...patch, tripId, updatedAt: new Date().toISOString(),
    };
    this.itineraries.set(tripId, next);
    return next;
  }

  async listPhotos(tripId: string) {
    return this.photos.get(tripId) ?? [];
  }
  async addPhoto(tripId: string, p: Omit<Photo, "id" | "tripId">) {
    const photo: Photo = { ...p, id: randomUUID().slice(0, 8), tripId };
    this.photos.set(tripId, [...(this.photos.get(tripId) ?? []), photo]);
    return photo;
  }
  async deletePhoto(tripId: string, id: string) {
    const list = this.photos.get(tripId) ?? [];
    const next = list.filter((p) => p.id !== id);
    this.photos.set(tripId, next);
    return next.length !== list.length;
  }

  async listExpenses(tripId: string) {
    return (this.expenses.get(tripId) ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
  }
  async addExpense(tripId: string, e: Omit<Expense, "id" | "tripId">) {
    const row: Expense = { ...e, id: randomUUID().slice(0, 8), tripId };
    this.expenses.set(tripId, [...(this.expenses.get(tripId) ?? []), row]);
    return row;
  }
  async deleteExpense(tripId: string, id: string) {
    const list = this.expenses.get(tripId) ?? [];
    const next = list.filter((x) => x.id !== id);
    this.expenses.set(tripId, next);
    return next.length !== list.length;
  }
}

/* 개발 중 핫리로드로 저장소가 날아가지 않게 전역에 붙여 둔다 */
const g = globalThis as unknown as { __store?: Store };
export const store: Store = g.__store ?? (g.__store = new MemoryStore());
