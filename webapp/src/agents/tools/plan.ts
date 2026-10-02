/* 일정 담당의 도구. 전부 저장소와 일정 엔진만 쓴다 — 외부 호출 없음. */
import { tool } from "ai";
import { z } from "zod";
import { findFacility, getDayInfo } from "@/lib/dayinfo";
import {
  bestInsert, compute, diff, findStop, hm, optimize, turns,
} from "@/lib/itinerary";
import { getRegion } from "@/lib/regions";
import { store } from "@/lib/store";
import type { AgentContext } from "../harness";

async function ctxOf(tripId: string) {
  const trip = await store.getTrip(tripId);
  const pack = getRegion(trip?.region);
  const it = await store.getItinerary(tripId);
  if (!trip || !pack || !it) return null;
  return { trip, pack, it };
}

const NO_MAP = { error: "이 여행에는 지도 데이터가 없습니다. 설계 담당이 맡는 여행입니다." };

export function planTools(ctx: AgentContext) {
  const { tripId } = ctx;

  return {
    list: tool({
      description: "오늘 일정 전체를 시각·장소·구간 거리와 함께 돌려준다.",
      inputSchema: z.object({}),
      execute: async () => {
        const c = await ctxOf(tripId);
        if (!c) return NO_MAP;
        const p = compute(c.pack, c.it.items, c.it.start, c.it.busy);
        return {
          mode: c.pack.mode,
          total_km: +(p.totalM / 1000).toFixed(2),
          move_min: p.moveMin,
          ends_at: hm(p.endAt),
          items: p.rows.map((r, i) => ({
            no: i + 1,
            time: hm(r.at),
            name: r.stop.name,
            zone: r.stop.zl,
            stay_min: r.stay,
            leg_m: r.leg ? Math.round(r.leg.m) : 0,
            problem: r.problem,
          })),
        };
      },
    }),

    operating_today: tool({
      description:
        "그 날짜의 공식 운영정보를 가져와 일정에 있는 곳이 실제로 여는지 대조한다. " +
        "운휴·준비중인 곳과 공연 시각을 알려준다. '오늘 뭐 닫았어?' 류 질문에 쓴다.",
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("비우면 이 여행 날짜"),
      }),
      execute: async ({ date }) => {
        const c = await ctxOf(tripId);
        if (!c) return NO_MAP;
        if (c.trip.region !== "everland") {
          return { error: "일별 운영정보는 지금 에버랜드만 있습니다." };
        }
        const info = await getDayInfo(date ?? c.trip.date);
        if (info.error && !info.facilities.length) {
          return { error: `운영정보를 가져오지 못했습니다: ${info.error}` };
        }

        const plan = compute(c.pack, c.it.items, c.it.start, c.it.busy);
        const checked = plan.rows.map((r) => {
          const f = findFacility(info, r.stop.name);
          return {
            name: r.stop.name,
            planned_at: hm(r.at),
            found: Boolean(f),
            status: f?.statusLabel ?? null,
            open: f?.open ?? null,
            close: f?.close ?? null,
            show_times: f?.showTimes ?? [],
            /* 미공개(준비중)는 휴장이 아니다 — 확정 공개된 날에만 경고한다 */
            warn: f && (f.status === "closed" || (!info.provisional && f.status === "preparing"))
              ? `${r.stop.name} 은(는) 이 날 ${f.statusLabel} 입니다`
              : null,
          };
        });

        return {
          date: info.date,
          fetched_at: info.fetchedAt,
          stale: info.stale ?? false,
          /* 에버랜드는 하루 이틀 앞까지만 운영표를 공개한다. provisional 이면
             "준비중"은 휴장이 아니라 아직 안 정해진 것이다. 휴장이라고 말하면 안 된다. */
          provisional: info.provisional,
          provisional_note: info.provisional
            ? "이 날짜의 운영표는 아직 공개 전입니다. '준비중'은 휴장이 아니라 미정이라는 뜻이니 휴장이라고 말하지 마세요. 방문 하루 전에 다시 확인하라고 안내하세요."
            : null,
          source: info.source,
          summary: info.counts,
          in_plan: checked,
          problems: checked.filter((x) => x.warn).map((x) => x.warn),
          shows: info.facilities
            .filter((f) => f.category.includes("공연") && f.status === "open")
            .map((f) => ({ name: f.name, times: f.showTimes, open: f.open, close: f.close })),
        };
      },
    }),

    next: tool({
      description: "지금 커서 기준으로 다음 목적지와 거리·이동 시간·길안내를 돌려준다.",
      inputSchema: z.object({}),
      execute: async () => {
        const c = await ctxOf(tripId);
        if (!c) return NO_MAP;
        const p = compute(c.pack, c.it.items, c.it.start, c.it.busy);
        const n = p.rows[c.it.cursor + 1];
        if (!n) return { done: true, message: "마지막 일정입니다." };
        return {
          name: n.stop.name,
          arrive_at: hm(n.at),
          meters: Math.round(n.leg?.m ?? 0),
          move_min: Math.ceil((n.leg?.m ?? 0) / c.pack.speed),
          note: n.stop.note,
          steps: n.leg ? turns(c.pack, n.leg).map((s) => ({ m: Math.round(s.m), turn: s.turn })) : [],
        };
      },
    }),

    candidates: tool({
      description: "일정에 넣지 않은 장소 목록. 구역으로 좁힐 수 있다.",
      inputSchema: z.object({
        zone: z.string().optional().describe("구역 id 또는 이름. 생략하면 전부."),
      }),
      execute: async ({ zone }) => {
        const c = await ctxOf(tripId);
        if (!c) return NO_MAP;
        const inPlan = new Set(c.it.items);
        return {
          zones: c.pack.zones.map((z) => z.name),
          out_of_plan: c.pack.pool
            .filter((p) => !inPlan.has(p.id))
            .filter((p) => !zone || p.zone === zone || p.zl === zone)
            .map((p) => ({ id: p.id, name: p.name, zone: p.zl, kind: p.kind, rank: p.rank ?? 1 })),
        };
      },
    }),

    add: tool({
      description:
        "장소를 일정에 넣는 제안을 만든다. 확정하지 않는다 — 늘어나는 거리·시간을 돌려주고 사용자가 화면에서 고른다.",
      inputSchema: z.object({ name: z.string().describe("장소 이름 또는 id") }),
      execute: async ({ name }) => {
        const c = await ctxOf(tripId);
        if (!c) return NO_MAP;
        const p = findStop(c.pack, name);
        if (!p) return { ok: false, message: "그런 이름을 찾지 못했습니다." };
        if (c.it.items.includes(p.id)) return { ok: false, message: "이미 일정에 있습니다." };
        const at = bestInsert(c.pack, c.it.items, p.id, c.it.start, c.it.busy);
        const next = c.it.items.slice();
        next.splice(at, 0, p.id);
        const d = diff(
          compute(c.pack, c.it.items, c.it.start, c.it.busy),
          compute(c.pack, next, c.it.start, c.it.busy),
        );
        return {
          ok: true, proposal: next, name: p.name, insert_at: at + 1,
          delta_m: Math.round(d.dm), delta_move_min: d.dmove, delta_end_min: d.dend,
          new_problems: d.newProblems, verdict: d.verdict,
          needs_confirm: d.verdict === "bad",
        };
      },
    }),

    remove: tool({
      description: "장소를 일정에서 빼는 제안을 만든다. 확정하지 않는다.",
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => {
        const c = await ctxOf(tripId);
        if (!c) return NO_MAP;
        const p = findStop(c.pack, name);
        if (!p || !c.it.items.includes(p.id)) return { ok: false, message: "일정에 없습니다." };
        const next = c.it.items.filter((x) => x !== p.id);
        const d = diff(
          compute(c.pack, c.it.items, c.it.start, c.it.busy),
          compute(c.pack, next, c.it.start, c.it.busy),
        );
        return {
          ok: true, proposal: next, name: p.name,
          delta_m: Math.round(d.dm), delta_move_min: d.dmove, delta_end_min: d.dend,
          verdict: d.verdict,
        };
      },
    }),

    optimize: tool({
      description: "이동 거리가 줄도록 순서를 다시 짠 제안을 만든다. 확정하지 않는다.",
      inputSchema: z.object({}),
      execute: async () => {
        const c = await ctxOf(tripId);
        if (!c) return NO_MAP;
        const before = compute(c.pack, c.it.items, c.it.start, c.it.busy);
        const next = optimize(c.pack, c.it.items, c.it.start, c.it.busy);
        const d = diff(before, compute(c.pack, next, c.it.start, c.it.busy));
        if (d.dm > -30) {
          return { ok: false, message: "이미 충분히 짧습니다.", delta_m: Math.round(d.dm) };
        }
        return {
          ok: true, proposal: next,
          delta_m: Math.round(d.dm), delta_move_min: d.dmove, verdict: d.verdict,
        };
      },
    }),
  };
}
