/* ============================================================
   에이전트 하네스

   에이전트 하나 = 프롬프트(인격) + 도구 묶음 + 모델 등급.
   하네스가 하는 일은 셋뿐이다.

     1) 그 에이전트의 프롬프트와 도구만 쥐여 주고 모델을 돌린다
     2) 모델이 도구를 부르면 실행하고 결과를 되먹인다 (stopWhen 까지 반복)
     3) 무슨 도구를 어떤 입력으로 불렀는지 기록해서 돌려준다

   모델 호출과 도구 루프는 AI SDK 의 generateText/streamText 가 맡는다.
   우리는 "누가 무엇을 쓸 수 있는가"만 정의한다.
   ============================================================ */
import { generateText, stepCountIs, streamText, type ModelMessage, type ToolSet } from "ai";
import { hasModel, modelFor, promptSuffix, providerId, stripThinking, type Tier } from "./provider";

export { modelFor, type Tier };

export interface AgentContext {
  tripId: string;
}

export interface AgentDef<T extends ToolSet = ToolSet> {
  id: string;
  name: string;
  /** 명부·UI 에 보일 한 줄 */
  blurb: string;
  /** 프롬프트 본문. src/agents/prompts/<id>.md 를 읽는 함수다
      (개발 중 .md 를 고치면 바로 반영되도록 문자열이 아니라 함수로 받는다) */
  prompt: string | (() => string);
  tier: Tier;
  /** 이 에이전트가 손댈 수 있는 도구 — 다른 에이전트의 도구는 보이지 않는다 */
  tools: (ctx: AgentContext) => T | Promise<T>;
  /** 최대 몇 번까지 도구를 부를 수 있는가 */
  maxSteps?: number;
}

export interface ToolCallLog {
  tool: string;
  input: unknown;
  output: unknown;
  ms: number;
}

export interface RunResult {
  agent: string;
  text: string;
  calls: ToolCallLog[];
  usage?: { inputTokens?: number; outputTokens?: number };
}

export const hasKey = hasModel;

/** 에이전트가 늘 지켜야 하는 규칙 — 프롬프트 뒤에 붙는다 */
const GROUND_RULES = `
규칙
- 한국어로 답한다.
- 숫자(거리·시간·금액·장수)는 반드시 도구를 불러 확인한 값만 쓴다. 기억이나 추측으로 쓰지 않는다.
- 도구가 주지 않은 사실은 모른다고 말한다.
- 답은 두세 문장 안으로. 목록이 필요하면 짧게 끊어 쓴다.
- 사과하거나 자기소개하지 않는다. 결과만 말한다.`;

function systemFor(agent: AgentDef, ctx: AgentContext): string {
  const body = typeof agent.prompt === "function" ? agent.prompt() : agent.prompt;
  return `${body.trim()}\n${GROUND_RULES}\n\n맡은 여행 id: ${ctx.tripId}${promptSuffix()}`;
}

/** 로컬 모델은 느리다 — 도구를 부르는 횟수를 줄인다 */
function stepsFor(agent: AgentDef): number {
  const n = agent.maxSteps ?? 6;
  return providerId() === "ollama" ? Math.min(n, 3) : n;
}

/** 한 에이전트를 끝까지 돌리고 결과를 모아 돌려준다 */
export async function runAgent(
  agent: AgentDef,
  ctx: AgentContext,
  task: string,
  history: ModelMessage[] = [],
): Promise<RunResult> {
  const calls: ToolCallLog[] = [];
  const tools = await agent.tools(ctx);

  const r = await generateText({
    model: modelFor(agent.tier),
    system: systemFor(agent, ctx),
    messages: [...history, { role: "user", content: task }],
    tools: wrapWithLog(tools, calls),
    stopWhen: stepCountIs(stepsFor(agent)),
  });

  return {
    agent: agent.id,
    text: stripThinking(r.text),
    calls,
    usage: { inputTokens: r.usage?.inputTokens, outputTokens: r.usage?.outputTokens },
  };
}

/** 스트리밍으로 돌린다 — 총괄이 사용자에게 바로 흘려 보낼 때 쓴다 */
export function streamAgent(
  agent: AgentDef,
  ctx: AgentContext,
  task: string,
  history: ModelMessage[] = [],
  calls: ToolCallLog[] = [],
) {
  return streamText({
    model: modelFor(agent.tier),
    system: systemFor(agent, ctx),
    messages: [...history, { role: "user", content: task }],
    tools: wrapWithLog(agent.tools(ctx) as ToolSet, calls),
    stopWhen: stepCountIs(stepsFor(agent)),
  });
}

/** 도구 실행을 가로채 무엇을 불렀는지 남긴다 — 화면의 "무슨 일을 했는지" 줄이 여기서 나온다 */
function wrapWithLog(tools: ToolSet, sink: ToolCallLog[]): ToolSet {
  const out: ToolSet = {};
  for (const [name, def] of Object.entries(tools)) {
    const execute = def.execute;
    out[name] = {
      ...def,
      execute: execute
        ? async (input: never, opts: never) => {
            const t0 = Date.now();
            let output: unknown;
            try {
              output = await execute(input, opts);
            } catch (e) {
              output = { error: e instanceof Error ? e.message : String(e) };
            }
            sink.push({ tool: name, input, output, ms: Date.now() - t0 });
            return output;
          }
        : undefined,
    } as ToolSet[string];
  }
  return out;
}
