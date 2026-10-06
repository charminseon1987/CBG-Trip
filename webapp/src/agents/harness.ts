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

/* Ollama 의 OpenAI 호환 엔드포인트는 max_tokens 가 없으면 생성을 일찍 끊는다.
   그러면 도구 호출도 본문도 없이 빈 응답이 온다 — 실제로 당했다.
   넉넉히 주되 무한정은 아니게. */
const MAX_OUTPUT = Number(process.env.AGENT_MAX_TOKENS || 2000);
import { hasModel, modelFor, modelName, promptSuffix, providerId, stripThinking, type Tier } from "./provider";

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
  /** 도구를 한 번도 안 쓴 답은 믿지 않는다 (담당은 사실을 보고하는 자리다).
      총괄처럼 도구가 없는 역할만 false 로 둔다. */
  requiresTool?: boolean;
  /** 첫 걸음에 반드시 부르게 할 도구. 무엇을 물어봐도 먼저 읽어야 하는
      '현황 조회' 도구를 적는다 (읽기 전용이어야 한다).
      비워 두면 도구 묶음의 첫 번째가 쓰인다. */
  firstTool?: string;
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
  /* 어느 등급·어느 모델이 실제로 돌았는지. 난이도별 모델 분배가
     말뿐이 아니라는 것을 밖에서 확인할 수 있게 남긴다. */
  tier: Tier;
  model: string;
  provider: string;
  ms: number;
  /** 모델이 도구 호출을 흉내 낸 글을 내서 버렸는가 */
  fabricated?: boolean;
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

/* 작은 모델은 도구를 부르는 대신 "도구를 부른 것처럼 생긴 JSON" 을 본문에 쓰기도 한다.
   그대로 내보내면 지어낸 숫자가 사용자에게 간다 — 실제로 겪었다.
   그런 답은 버리고 도구 결과로 돌아간다. */
const FAKE_CALL = /^\s*[{[][\s\S]*"(name|function|arguments|tool|parameters)"\s*:/;
function looksFabricated(text: string, calledTools: number): boolean {
  const t = text.trim();
  if (!t) return false;
  if (calledTools > 0) return false;        // 진짜로 도구를 썼으면 믿는다
  return FAKE_CALL.test(t);
}

/* 먼저 돌려 둘 '현황 조회' 도구 이름.

   도구를 부르게 만들려고 세 가지를 차례로 시도했고 앞의 둘은 실패했다.
     1) 프롬프트로 부탁  — 질문을 어떻게 쓰느냐에 따라 4번 중 1~2번만 불렀다
     2) tool_choice      — "required" 는 Ollama 가 조용히 무시한다.
                           이름을 지정한 형태로 보내면 요청에는 분명히 실려 나가는데
                           (AGENT_DEBUG=1 로 선로를 찍어 확인했다) 그래도 안 부른다.
     3) 우리가 직접 실행 — 이것만 100% 된다.

   그래서 모델에게 묻지 않고 하네스가 먼저 조회 도구를 돌려 결과를 물려 준다.
   모델이 할 일은 '사실을 구하는 것'이 아니라 '받은 사실을 글로 옮기는 것'이 된다. */
function groundingTool(agent: AgentDef, tools: ToolSet): string | null {
  if (agent.requiresTool === false) return null;
  const names = Object.keys(tools);
  if (names.length === 0) return null;
  const want = agent.firstTool;
  if (want && names.includes(want)) return want;
  return names[0];
}

/** 인자 없이 부를 수 있는 도구만 우리가 대신 돌린다 */
function takesNoArgs(def: ToolSet[string]): boolean {
  const schema = def.inputSchema as { safeParse?: (v: unknown) => { success: boolean } } | undefined;
  if (!schema?.safeParse) return false;
  return schema.safeParse({}).success;
}

/* 답에 적힌 숫자가 도구 결과에 없는 숫자면 지어낸 것이다.

   도구를 대신 돌려 주면 "도구를 한 번도 안 썼다" 는 그물에는 아무것도 걸리지
   않는다. 그래서 그물을 하나 더 친다 — 천 단위 이상(네 자리 이상) 숫자는
   도구가 준 값 중에 있어야 한다. 작은 수(인원·개수·시각)는 글을 다듬는 과정에서
   자연스럽게 나오므로 보지 않는다. */
const BIG = /\d[\d,]{3,}/g;
const digits = (s: string) => s.replace(/,/g, "");

function invented(text: string, outputs: unknown[]): string[] {
  const known = new Set<string>();
  for (const o of outputs) {
    for (const m of JSON.stringify(o).match(BIG) ?? []) known.add(digits(m));
  }
  const bad: string[] = [];
  for (const m of text.match(BIG) ?? []) {
    const d = digits(m);
    if (d.length >= 4 && !known.has(d)) bad.push(m);
  }
  return bad;
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
  const t0 = Date.now();

  /* ── 1단계. 사실을 먼저 구해 둔다 (모델에게 맡기지 않는다) ── */
  const grounding = groundingTool(agent, tools);
  const facts: ModelMessage[] = [];
  if (grounding && takesNoArgs(tools[grounding])) {
    const t1 = Date.now();
    try {
      const out = await tools[grounding].execute?.({}, { toolCallId: "grounding", messages: [] });
      calls.push({ tool: grounding, input: {}, output: out, ms: Date.now() - t1 });
      facts.push({
        role: "user",
        content:
          `[${grounding} 도구의 실제 결과]\n${JSON.stringify(out)}\n\n` +
          `이 값만 쓴다. 여기에 없는 숫자는 쓰지 않는다. 비어 있으면 비어 있다고 말한다.`,
      });
    } catch (e) {
      console.warn(`[agent:${agent.id}] ${grounding} 미리 실행 실패: ${String(e).slice(0, 80)}`);
    }
  }

  const r = await generateText({
    model: modelFor(agent.tier),
    system: systemFor(agent, ctx),
    messages: [...history, { role: "user", content: task }, ...facts],
    tools: wrapWithLog(tools, calls),
    stopWhen: stepCountIs(stepsFor(agent)),
    maxOutputTokens: MAX_OUTPUT,
  });

  const clean = stripThinking(r.text);

  /* ── 2단계. 받은 사실대로 썼는지 검사한다 ──
     담당 에이전트는 도구로 확인한 사실만 말해야 한다.
     도구를 한 번도 안 쓰고 답했다면 그건 지어낸 것이다 — 작은 모델에서 실제로 겪었다.
     ("사진 몇 장?" 에 도구 없이 "아직 없습니다" 라고 답했는데 실제로는 있었다.)
     틀린 답을 보여 주느니 답을 못 받았다고 말하는 편이 낫다. */
  const needTool = agent.requiresTool !== false;
  const madeUp = needTool ? invented(clean, calls.map((c) => c.output)) : [];
  const fabricated =
    (needTool && calls.length === 0 && clean.length > 0) ||
    looksFabricated(clean, calls.length) ||
    madeUp.length > 0;
  if (fabricated) {
    const why = madeUp.length
      ? `도구가 주지 않은 숫자를 썼습니다(${madeUp.join(", ")})`
      : `도구 호출 없이 답을 냈습니다(${calls.length}회)`;
    console.warn(`[agent:${agent.id}] ${why}. 버립니다: ${clean.slice(0, 80)}`);
  }

  return {
    agent: agent.id,
    text: fabricated ? "" : clean,
    fabricated,
    calls,
    tier: agent.tier,
    model: modelName(agent.tier),
    provider: providerId(),
    ms: Date.now() - t0,
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
    /* generateText 쪽과 같은 이유로 꼭 있어야 한다 — 없으면 Ollama 가 생성을
       일찍 끊어 총괄의 답이 한 토막으로 나온다. 빠뜨렸다가 화면에서 들켰다. */
    maxOutputTokens: MAX_OUTPUT,
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
