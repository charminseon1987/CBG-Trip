/* ============================================================
   총괄 에이전트

   흐름은 셋이다.
     1) classify  — 누구에게 맡길지 고른다 (모델 한 번, 또는 규칙)
     2) delegate  — 고른 담당을 하네스로 돌린다 (담당은 제 도구만 본다)
     3) speak     — 보고를 모아 총괄의 말로 스트리밍한다

   화면은 이 세 단계를 그대로 본다: 분류 → 위임 → 답.
   ============================================================ */
import { generateObject, type ModelMessage } from "ai";
import { z } from "zod";
import { AGENTS } from "./registry";
import { CHIEF } from "./prompts";
import {
  hasKey, runAgent, streamAgent,
  type AgentContext, type AgentDef, type RunResult,
} from "./harness";
import { modelFor } from "./provider";
import { store } from "@/lib/store";
import { getRegion } from "@/lib/regions";

/* ---------- 1) 분류 ---------- */
const Route = z.object({
  agents: z.array(z.enum(["plan", "designer", "album", "ledger", "pass"])),
  why: z.string(),
});
export type Route = z.infer<typeof Route>;

/** 모델이 없거나 실패할 때 쓰는 규칙 */
export function keywordRoute(q: string, hasMap: boolean): Route {
  const m = q.replace(/\s/g, "");
  const out: Route["agents"] = [];
  if (/패스|정기권|연간|종일권|입장권|큐패스|플랜잇|자유이용권|회원권/.test(m)) out.push("pass");
  if (!out.length && /원|돈|지출|가계부|비용|얼마|샀|결제|예산/.test(m)) out.push("ledger");
  if (/사진|앨범|찍|캡션|일기|다이어리/.test(m)) out.push("album");
  if (/짜줘|추천|설계|코스|다시짜/.test(m) && !hasMap) out.push("designer");
  if (!out.length && /일정|동선|경로|다음|어디|빼|넣|추가|최적|거리|분|시간|타|놀이기구|공연/.test(m)) {
    out.push(hasMap ? "plan" : "designer");
  }
  if (out.length) return { agents: out, why: "규칙으로 분류" };
  if (/안녕|하이|고마|반가|누구|뭐해|뭘할|할수있|도와|사용법|어떻게/.test(m)) {
    return { agents: [], why: "총괄이 바로 답합니다" };
  }
  return { agents: [hasMap ? "plan" : "designer"], why: "규칙으로 분류" };
}

export async function classify(q: string, hasMap: boolean): Promise<Route> {
  if (!hasKey()) return keywordRoute(q, hasMap);
  try {
    const { object } = await generateObject({
      model: modelFor("quick"),
      schema: Route,
      system:
        "요청을 처리할 담당을 고른다. plan(지도 기반 일정·경로), designer(지도 없는 여행의 시간표 설계), " +
        "album(사진·여행일기), ledger(이미 쓴 돈의 기록·가계부), pass(입장권·정기권·패스권을 뭘 살지 고르는 문제). 인사·잡담·사용법처럼 담당이 필요 없으면 agents 를 빈 배열로 둔다. " +
        (hasMap
          ? "이 여행은 지도 데이터가 있다 — 일정 관련은 plan 이다."
          : "이 여행은 지도 데이터가 없다 — 일정 관련은 designer 다."),
      prompt: q,
    });
    return object.agents.length || object.why ? object : keywordRoute(q, hasMap);
  } catch {
    return keywordRoute(q, hasMap);
  }
}

/* ---------- 2) 위임 ---------- */
export async function delegate(
  id: string, ctx: AgentContext, task: string,
): Promise<RunResult> {
  const agent: AgentDef | undefined = AGENTS[id];
  if (!agent) {
    return { agent: id, text: "그런 담당이 없습니다.", calls: [],
             tier: "quick" as const, model: "-", provider: "-", ms: 0 };
  }
  return runAgent(agent, ctx, task);
}

/* ---------- 3) 총괄이 답한다 ---------- */
export async function factsOf(tripId: string) {
  const trip = await store.getTrip(tripId);
  const pack = getRegion(trip?.region);
  const photos = await store.listPhotos(tripId);
  const spend = await store.listExpenses(tripId);
  return {
    여행: trip && {
      이름: trip.title, 날짜: trip.date, 장소: trip.place, 인원: trip.people, 테마: trip.theme,
    },
    지도: pack ? { 지역: pack.title, 이동: pack.mode === "drive" ? "차" : "도보", 장소수: pack.pool.length } : null,
    사진: { 장수: photos.length },
    지출: { 총액: spend.reduce((s, r) => s + r.amount, 0), 건수: spend.length },
  };
}

/** 보고를 합쳐 총괄의 말로 스트리밍한다 */
export function speak(
  ctx: AgentContext, question: string, reports: RunResult[], facts: unknown,
) {
  const chief: AgentDef = {
    id: "chief", name: "총괄", blurb: "", prompt: CHIEF, tier: "quick",
    tools: () => ({}), maxSteps: 1, requiresTool: false,
  };
  const body =
    `[오늘 여행 상황]\n${JSON.stringify(facts)}\n\n` +
    `[담당 보고]\n${
      reports.length
        ? reports
            .map((r) => `· ${AGENTS[r.agent]?.name ?? r.agent}: ${r.text || JSON.stringify(r.calls.at(-1)?.output ?? {})}`)
            .join("\n")
        : "(맡긴 곳 없음 — 네가 바로 답한다)"
    }\n\n[사용자 질문]\n${question}\n\n사용자에게 건넬 답만 쓴다. 머리말이나 따옴표 없이.`;
  return streamAgent(chief, ctx, body);
}

/** 모델 없이 돌 때 — 도구 결과를 사람 말로 */
export function offlineSay(reports: RunResult[]): string {
  if (!reports.length) {
    return "모델 키가 없어 지금은 도구 결과만 보여 드립니다. ANTHROPIC_API_KEY 를 넣으면 총괄이 말로 답합니다.";
  }
  return reports
    .map((r) => {
      const out = r.calls.at(-1)?.output as Record<string, unknown> | undefined;
      if (!out) return `${AGENTS[r.agent]?.name ?? r.agent}: 결과가 없습니다.`;
      return `${AGENTS[r.agent]?.name ?? r.agent}: ${JSON.stringify(out)}`;
    })
    .join("\n");
}

export type { ModelMessage };
