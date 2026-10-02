/* ============================================================
   에이전트 명부 — 누가 있고, 무엇을 쥐고 있는가.
   총괄은 여기에 없다. 총괄은 이 명부를 보고 고르는 쪽이다. (chief.ts)
   ============================================================ */
import type { AgentDef } from "./harness";
import { ALBUM, DESIGNER, LEDGER, PASS, PLAN } from "./prompts";
import { albumTools, designerTools, ledgerTools } from "./tools/misc";
import { passTools } from "./tools/pass";
import { planTools } from "./tools/plan";

export const AGENTS: Record<string, AgentDef> = {
  plan: {
    id: "plan",
    name: "일정",
    blurb: "실제 길 위에서 거리를 재고 순서를 짠다",
    prompt: PLAN,
    tier: "quick",
    tools: planTools,
    maxSteps: 6,
  },
  designer: {
    id: "designer",
    name: "설계",
    blurb: "지도 없는 지역의 하루 시간표를 만든다",
    prompt: DESIGNER,
    tier: "default",
    tools: designerTools,
    maxSteps: 4,
  },
  pass: {
    id: "pass",
    name: "패스권",
    blurb: "종일권과 정기권을 같은 자로 비교해 준다",
    prompt: PASS,
    tier: "quick",
    tools: passTools,
    maxSteps: 5,
  },
  album: {
    id: "album",
    name: "앨범",
    blurb: "사진을 일정 블록으로 묶고 캡션을 챙긴다",
    prompt: ALBUM,
    tier: "quick",
    tools: albumTools,
    maxSteps: 4,
  },
  ledger: {
    id: "ledger",
    name: "회계",
    blurb: "지출을 분류해 적고 1인당 금액을 센다",
    prompt: LEDGER,
    tier: "quick",
    tools: ledgerTools,
    maxSteps: 4,
  },
};

export type AgentId = keyof typeof AGENTS;

export const agentList = () =>
  Object.values(AGENTS).map((a) => ({
    id: a.id,
    name: a.name,
    blurb: a.blurb,
    tier: a.tier,
    tools: Object.keys(a.tools({ tripId: "preview" })),
  }));
