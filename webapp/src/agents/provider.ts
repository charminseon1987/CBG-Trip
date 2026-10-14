/* ============================================================
   모델 공급자 — Anthropic 또는 OpenAI 호환 주소

   AGENT_PROVIDER=anthropic → Anthropic API (기본)
   AGENT_PROVIDER=ollama    → OpenAI 호환 주소. 기본값이 내 컴퓨터의 Ollama 다.

   이름이 "ollama" 로 남아 있지만 **Ollama 전용이 아니다.** OpenAI 호환
   규격을 따르는 곳이면 어디든 같은 길로 간다 — 주소와 키만 바꾸면 된다.
   배포에서 쓰려면 그래야 한다: Vercel 서버에는 localhost:11434 가 없다.

     로컬  AGENT_BASE_URL 없음              → http://127.0.0.1:11434/v1 (내 Ollama)
     배포  AGENT_BASE_URL=https://.../v1    → 바깥 서버. AGENT_API_KEY 도 같이

   로컬이냐 바깥이냐는 **주소를 보고 정한다**(isLocal). 환경 변수를 하나 더
   두면 주소와 엇갈릴 수 있어서다. 그 판단이 세 군데를 가른다 —
   키를 요구할지(hasModel) · 살았는지 어떻게 물을지(probe) · 걸음 수를
   줄일지(harness 의 stepsFor).

   둘 다 AI SDK 의 LanguageModel 로 나오므로 하네스는 어느 쪽인지 모른다.
   ============================================================ */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type Tier = "quick" | "default";
export type ProviderId = "anthropic" | "ollama";

export const providerId = (): ProviderId =>
  (process.env.AGENT_PROVIDER as ProviderId) === "ollama" ? "ollama" : "anthropic";

/* 새 이름(AGENT_*)이 먼저, 옛 이름(OLLAMA_*)도 받는다 — 이미 .env.local 에 쓰고 있다 */
const BASE_URL =
  process.env.AGENT_BASE_URL || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1";
const API_KEY =
  process.env.AGENT_API_KEY || process.env.OLLAMA_API_KEY || "";

/** 내 컴퓨터를 가리키는가. 바깥 서버면 키가 있어야 하고, 걸음을 줄일 이유도 없다 */
export const isLocal = () => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(BASE_URL);

/* 조직 키(워크스페이스에 묶이지 않은 키)는 anthropic-workspace-id 헤더가 필요하다. */
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  headers: process.env.ANTHROPIC_WORKSPACE_ID
    ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
    : undefined,
});

/* AGENT_DEBUG=1 이면 모델에 실제로 무엇을 보냈는지 한 줄로 남긴다.
   "도구를 반드시 부르게 했는데 왜 안 부르나" 를 눈으로 확인하려면
   하네스가 의도한 값이 아니라 선로를 타고 나간 값을 봐야 한다. */
const DEBUG = process.env.AGENT_DEBUG === "1";

const traced: typeof fetch = async (input, init) => {
  if (DEBUG && init?.body) {
    try {
      const b = JSON.parse(String(init.body)) as {
        model?: string; tool_choice?: unknown; tools?: { function?: { name?: string } }[];
        max_tokens?: number;
      };
      console.log(
        `[model→] ${b.model} tool_choice=${JSON.stringify(b.tool_choice) ?? "(없음)"}` +
        ` tools=${(b.tools ?? []).map((t) => t.function?.name).join(",") || "(없음)"}` +
        ` max_tokens=${b.max_tokens}`,
      );
    } catch { /* 본문이 JSON 이 아니면 넘어간다 */ }
  }
  return fetch(input, init);
};

/* 내 Ollama 는 키를 안 본다 — 아무 값이나 있으면 된다.
   바깥 서버는 진짜 키를 봐야 하므로 AGENT_API_KEY 를 쓴다. */
const compat = createOpenAICompatible({
  name: "ollama",
  baseURL: BASE_URL,
  apiKey: API_KEY || "ollama",
  fetch: traced,
  /* 이걸 안 켜면 SDK 가 구조화 출력을 json_object 로 보낸다. Groq 은 그걸
     400 으로 거절해서 총괄의 분류(chief.ts 의 classify)가 늘 실패하고
     규칙 분류로 떨어졌다 — 답은 나오지만 "왜 그 담당인지" 가 사라진다.
     json_schema 는 Groq 도 로컬 Ollama 도 받는 것을 둘 다 찔러 확인했다. */
  supportsStructuredOutputs: true,
});

const MODELS: Record<ProviderId, Record<Tier, string>> = {
  anthropic: {
    quick: process.env.AGENT_MODEL_QUICK || "claude-haiku-4-5-20251001",
    default: process.env.AGENT_MODEL_DEFAULT || "claude-sonnet-5",
  },
  ollama: {
    /* 기본값은 내 Ollama 에 받아 둔 것이다. qwen3 는 tools 를 지원한다 —
       작은 쪽이 빠르고, 큰 쪽이 도구를 더 잘 고른다.
       바깥 서버로 갈 때는 그쪽 이름을 넣어야 한다 (예: qwen/qwen3-32b) */
    quick: process.env.OLLAMA_MODEL_QUICK || "qwen3:1.7b",
    default: process.env.OLLAMA_MODEL_DEFAULT || "qwen3:4b",
  },
};

export function modelFor(tier: Tier): LanguageModel {
  const p = providerId();
  const name = MODELS[p][tier];
  return p === "ollama" ? compat(name) : anthropic(name);
}

export const modelName = (tier: Tier) => MODELS[providerId()][tier];

/** 쓸 준비가 되었는가. 내 Ollama 는 키가 필요 없지만 바깥 서버는 필요하다.
    여기서 false 면 총괄이 모델 없이 규칙으로 답한다 — 조용히 죽지 않는다. */
export const hasModel = () =>
  providerId() === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY)
  : isLocal() ? true
  : Boolean(API_KEY);

/** 실제로 닿는지 — /api/health 가 쓴다 */
export async function probe(): Promise<{ up: boolean; models?: string[]; error?: string }> {
  if (providerId() !== "ollama") {
    return { up: Boolean(process.env.ANTHROPIC_API_KEY) };
  }
  /* 내 Ollama 는 제 규격(/api/tags)이 받아 둔 모델까지 알려 준다.
     바깥 서버에는 그런 길이 없으므로 OpenAI 규격의 /models 로 묻는다. */
  const url = isLocal()
    ? BASE_URL.replace(/\/v1\/?$/, "") + "/api/tags"
    : BASE_URL.replace(/\/$/, "") + "/models";
  try {
    const res = await fetch(url, {
      headers: API_KEY ? { authorization: `Bearer ${API_KEY}` } : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { up: false, error: `HTTP ${res.status}` };
    const d = (await res.json()) as {
      models?: { name: string }[];          // Ollama 꼴
      data?: { id: string }[];              // OpenAI 꼴
    };
    const names = d.models?.map((m) => m.name) ?? d.data?.map((m) => m.id) ?? [];
    return { up: true, models: names };
  } catch (e) {
    return { up: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* qwen3 는 기본으로 길게 "생각"한다 — 그만큼 느리다.
   프롬프트 끝의 /no_think 가 그 모드를 끈다. 도구를 부르고 결과를 옮기는 일에는
   긴 사고가 필요 없고, 끄면 응답이 몇 배 빨라진다.

   qwen 이 아닌 모델에는 뜻 없는 글자다. 예전에는 공급자로 갈랐지만 바깥
   서버에서는 아무 모델이나 올 수 있어, 이제 **모델 이름을 보고** 붙인다. */
export const promptSuffix = () =>
  providerId() === "ollama" && /qwen/i.test(modelName("quick") + modelName("default"))
    ? "\n\n/no_think"
    : "";

/* qwen3 같은 사고형 모델은 <think>…</think> 를 본문에 흘릴 때가 있다.
   사용자에게 보여 줄 글에서는 걷어낸다. */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<think>[\s\S]*$/, "")
    .trim();
}
