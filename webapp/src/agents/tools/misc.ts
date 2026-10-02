/* 앨범 · 회계 · 설계 담당의 도구 */
import { tool } from "ai";
import { z } from "zod";
import { compute, hm, toMin } from "@/lib/itinerary";
import { getRegion } from "@/lib/regions";
import { store } from "@/lib/store";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import type { AgentContext } from "../harness";

/** 그 시각에 어느 일정 블록에 있었는지 */
async function whereAt(tripId: string, time: string): Promise<string | null> {
  const trip = await store.getTrip(tripId);
  const pack = getRegion(trip?.region);
  const it = await store.getItinerary(tripId);
  if (!pack || !it) return null;
  const min = toMin(time);
  const p = compute(pack, it.items, it.start, it.busy);
  let hit: string | null = null;
  for (const r of p.rows) {
    if (min >= r.at) hit = r.stop.name;
  }
  return hit;
}

/* ---------------- 앨범 ---------------- */
export function albumTools({ tripId }: AgentContext) {
  return {
    summary: tool({
      description: "저장된 사진 수와 일정 블록별 장수, 캡션이 있는 장수.",
      inputSchema: z.object({}),
      execute: async () => {
        const photos = await store.listPhotos(tripId);
        const by: Record<string, number> = {};
        for (const p of photos) {
          const k = p.place ?? "분류 전";
          by[k] = (by[k] ?? 0) + 1;
        }
        return {
          total: photos.length,
          captioned: photos.filter((p) => p.caption).length,
          by_block: by,
        };
      },
    }),

    caption_missing: tool({
      description: "캡션이 비어 있는 사진의 시각과 장소 목록.",
      inputSchema: z.object({}),
      execute: async () => {
        const photos = await store.listPhotos(tripId);
        return {
          missing: photos
            .filter((p) => !p.caption)
            .map((p) => ({ id: p.id, at: p.takenAt, place: p.place })),
        };
      },
    }),

    set_caption: tool({
      description: "사진 한 장에 캡션을 쓴다.",
      inputSchema: z.object({ id: z.string(), caption: z.string() }),
      execute: async ({ id, caption }) => {
        const photos = await store.listPhotos(tripId);
        const p = photos.find((x) => x.id === id);
        if (!p) return { ok: false, message: "그 사진을 찾지 못했습니다." };
        p.caption = caption;
        return { ok: true, id, caption };
      },
    }),
  };
}

/* ---------------- 회계 ---------------- */
const CAT_IDS = EXPENSE_CATEGORIES.map((c) => c.id) as [string, ...string[]];

export function ledgerTools({ tripId }: AgentContext) {
  return {
    summary: tool({
      description: "오늘 쓴 돈의 분류별 합계·총액·1인당 금액.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await store.listExpenses(tripId);
        const trip = await store.getTrip(tripId);
        const people = Math.max(1, trip?.people ?? 1);
        const total = rows.reduce((s, r) => s + r.amount, 0);
        const by: Record<string, number> = {};
        for (const r of rows) {
          const name = EXPENSE_CATEGORIES.find((c) => c.id === r.category)?.name ?? r.category;
          by[name] = (by[name] ?? 0) + r.amount;
        }
        return {
          total, count: rows.length, people,
          per_person: Math.round(total / people),
          by_category: by,
        };
      },
    }),

    list: tool({
      description: "지출 내역 전체.",
      inputSchema: z.object({}),
      execute: async () => ({ rows: await store.listExpenses(tripId) }),
    }),

    add: tool({
      description:
        "지출을 기록한다. 시각을 주면 그때 있던 일정 블록이 장소로 자동으로 붙는다.",
      inputSchema: z.object({
        amount: z.number().int().positive().describe("원 단위 금액"),
        category: z.enum(CAT_IDS).describe("ticket car food snack gift etc 중 하나"),
        memo: z.string().optional(),
        at: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("HH:MM · 생략하면 지금"),
      }),
      execute: async ({ amount, category, memo, at }) => {
        const now = at ?? hm(new Date().getHours() * 60 + new Date().getMinutes());
        const place = await whereAt(tripId, now);
        const row = await store.addExpense(tripId, {
          amount, category: category as never, memo: memo ?? "", at: now, place,
        });
        return { ok: true, ...row };
      },
    }),
  };
}

/* ---------------- 설계 ---------------- */
export function designerTools({ tripId }: AgentContext) {
  return {
    trip_brief: tool({
      description: "이 여행의 조건(장소·날짜·인원·테마)을 돌려준다. 일정을 짜기 전에 먼저 부른다.",
      inputSchema: z.object({}),
      execute: async () => {
        const t = await store.getTrip(tripId);
        if (!t) return { error: "여행을 찾지 못했습니다." };
        return {
          title: t.title, date: t.date, end: t.end,
          place: t.place, people: t.people, theme: t.theme,
          has_map: Boolean(getRegion(t.region)),
        };
      },
    }),

    save_draft: tool({
      description:
        "짠 하루 일정을 저장한다. 시간 순서대로 7~10개. 저장하면 사용자 화면에 바로 나타난다.",
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              time: z.string().regex(/^\d{2}:\d{2}$/),
              name: z.string(),
              kind: z.enum(["move", "food", "see", "play", "rest", "photo", "stay"]),
              minutes: z.number().int().positive().optional(),
              note: z.string().optional(),
            }),
          )
          .min(3)
          .max(14),
        tips: z.array(z.string()).max(4).optional(),
      }),
      execute: async ({ items, tips }) => {
        drafts.set(tripId, { items, tips: tips ?? [], madeAt: new Date().toISOString() });
        return {
          ok: true, count: items.length,
          starts_at: items[0].time, ends_at: items[items.length - 1].time,
        };
      },
    }),

    get_draft: tool({
      description: "이미 저장된 하루 일정을 돌려준다.",
      inputSchema: z.object({}),
      execute: async () => drafts.get(tripId) ?? { items: [], message: "아직 짠 일정이 없습니다." },
    }),
  };
}

/* 설계 결과도 지금은 메모리에 둔다 — DB 를 붙이면 store 로 옮긴다 */
export interface Draft {
  items: { time: string; name: string; kind: string; minutes?: number; note?: string }[];
  tips: string[];
  madeAt: string;
}
const g = globalThis as unknown as { __drafts?: Map<string, Draft> };
export const drafts: Map<string, Draft> = g.__drafts ?? (g.__drafts = new Map());
