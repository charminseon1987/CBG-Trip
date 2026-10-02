/* 패스권 담당의 도구. 가격은 구워 둔 파일에서만 오고, 계산은 lib/passes.ts 가 한다. */
import { tool } from "ai";
import { z } from "zod";
import { getPassData, quote, type Party } from "@/lib/passes";
import { getRegion } from "@/lib/regions";
import { store } from "@/lib/store";
import type { AgentContext } from "../harness";

const PARTY = z.object({
  adult: z.number().int().min(0).default(0).describe("대인·청소년 (만 13세 이상)"),
  child: z.number().int().min(0).default(0).describe("소인 (만 36개월~만 12세)"),
  senior: z.number().int().min(0).default(0).describe("경로 (만 65세 이상)"),
  baby: z.number().int().min(0).default(0).describe("베이비 (만 36개월 미만)"),
});

/** 여행 인원만 알고 나이 구성을 모르면 전부 대인으로 둔다 */
async function partyOf(tripId: string, given?: Partial<Party>): Promise<Party> {
  if (given && (given.adult || given.child || given.senior || given.baby)) {
    return { adult: given.adult ?? 0, child: given.child ?? 0, senior: given.senior ?? 0, baby: given.baby ?? 0 };
  }
  const t = await store.getTrip(tripId);
  return { adult: Math.max(1, t?.people ?? 1), child: 0, senior: 0, baby: 0 };
}

function parkOf(region: string | null | undefined) {
  return region === "everland" ? "everland" : null;
}

export function passTools({ tripId }: AgentContext) {
  return {
    products: tool({
      description:
        "그 공원의 패스권 종류·가격·혜택을 전부 돌려준다. 가격의 출처와 확인 날짜도 함께 온다.",
      inputSchema: z.object({}),
      execute: async () => {
        const trip = await store.getTrip(tripId);
        const park = parkOf(trip?.region);
        if (!park) {
          return { error: "이 여행은 패스권 자료가 있는 공원이 아닙니다. 지금은 에버랜드만 있습니다." };
        }
        const d = getPassData(park)!;
        return {
          park: d.title,
          asOf: d.asOf,
          reliability: d.reliability,
          source_note: d.sourceNote,
          verify_url: d.verifyUrl,
          age_bands: d.ageBands,
          day_ticket: d.dayTicket,
          passes: d.passes,
          addons: d.addons,
        };
      },
    }),

    recommend: tool({
      description:
        "이 여행 조건으로 종일권과 모든 정기권을 비교해 어떤 것이 싼지 계산한다. " +
        "bestMix 는 사람마다 다른 권종을 샀을 때의 최저가다 — 보통 이것이 진짜 답이므로 먼저 말한다. " +
        "방문 횟수(연간)를 모르면 사용자에게 먼저 물어야 하지만, 일단 1회로 계산해 보여 줄 수도 있다.",
      inputSchema: z.object({
        visits: z.number().int().min(1).max(60).default(1)
          .describe("1년에 몇 번 갈 예정인가"),
        season: z.enum(["A", "B", "C", "D"]).optional()
          .describe("방문일의 시즌. 모르면 비우면 준성수기(B)로 계산한다"),
        renew: z.boolean().default(false).describe("정기권 재가입이면 true (재가입가가 더 싸다)"),
        party: PARTY.optional().describe("나이대별 인원. 비우면 여행 인원을 전부 대인으로 본다"),
      }),
      execute: async ({ visits, season, renew, party }) => {
        const trip = await store.getTrip(tripId);
        const park = parkOf(trip?.region);
        if (!park) {
          return { error: "이 여행은 패스권 자료가 있는 공원이 아닙니다. 지금은 에버랜드만 있습니다." };
        }
        const p = await partyOf(tripId, party);
        const q = quote(park, p, visits, season, renew);
        if (!q) return { error: "계산하지 못했습니다." };
        return {
          ...q,
          guessed_party: !party,
          caution:
            "가격은 공식 페이지에서 직접 가져오지 못했습니다. 반드시 verify_url 에서 확인하라고 사용자에게 알리세요.",
        };
      },
    }),

    break_even: tool({
      description:
        "정기권 하나가 종일권보다 싸지는 방문 횟수만 빠르게 알고 싶을 때. 1회부터 12회까지 총액 표를 돌려준다.",
      inputSchema: z.object({
        season: z.enum(["A", "B", "C", "D"]).optional(),
        party: PARTY.optional(),
      }),
      execute: async ({ season, party }) => {
        const trip = await store.getTrip(tripId);
        const park = parkOf(trip?.region);
        if (!park) return { error: "에버랜드 여행이 아닙니다." };
        const p = await partyOf(tripId, party);
        const rows = [1, 2, 3, 4, 5, 6, 8, 10, 12].map((v) => {
          const q = quote(park, p, v, season)!;
          return {
            visits: v,
            day: q.dayCost,
            best: q.best.name,
            best_total: q.best.total,
            saves: q.best.saves,
          };
        });
        return { party: p, season: season ?? "B", table: rows };
      },
    }),

    trip_context: tool({
      description: "이 여행의 날짜·인원·지역을 돌려준다. 추천 전에 먼저 확인한다.",
      inputSchema: z.object({}),
      execute: async () => {
        const t = await store.getTrip(tripId);
        if (!t) return { error: "여행을 찾지 못했습니다." };
        return {
          title: t.title, date: t.date, end: t.end, place: t.place,
          people: t.people, theme: t.theme,
          park: parkOf(t.region),
          region_title: getRegion(t.region)?.title ?? null,
        };
      },
    }),
  };
}
