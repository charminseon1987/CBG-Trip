/* ============================================================
   모델 공급자 — Anthropic(클라우드) 또는 Ollama(내 컴퓨터)

   AGENT_PROVIDER=ollama   → http://localhost:11434 의 모델을 쓴다. 키도 비용도 없다.
   AGENT_PROVIDER=anthropic → Anthropic API 를 쓴다 (기본)

   둘 다 AI SDK 의 LanguageModel 로 나오므로 하네스는 어느 쪽인지 모른다.
   ============================================================ */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type Tier = "quick" | "default";
export type ProviderId = "anthropic" | "ollama";

export const providerId = (): ProviderId =>
  (process.env.AGENT_PROVIDER as ProviderId) === "ollama" ? "ollama" : "anthropic";

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1";

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

/* Ollama 는 OpenAI 호환 엔드포인트를 연다. 키는 아무 값이나 있으면 된다. */
const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: OLLAMA_URL,
  apiKey: "ollama",
  fetch: traced,
});

const MODELS: Record<ProviderId, Record<Tier, string>> = {
  anthropic: {
    quick: process.env.AGENT_MODEL_QUICK || "claude-haiku-4-5-20251001",
    default: process.env.AGENT_MODEL_DEFAULT || "claude-sonnet-5",
  },
  ollama: {
    // qwen3 는 tools 를 지원한다. 작은 쪽이 빠르고, 큰 쪽이 도구를 더 잘 고른다.
    quick: process.env.OLLAMA_MODEL_QUICK || "qwen3:1.7b",
    default: process.env.OLLAMA_MODEL_DEFAULT || "qwen3:4b",
  },
};

export function modelFor(tier: Tier): LanguageModel {
  const p = providerId();
  const name = MODELS[p][tier];
  return p === "ollama" ? ollama(name) : anthropic(name);
}

export const modelName = (tier: Tier) => MODELS[providerId()][tier];

/** 쓸 준비가 되었는가. Ollama 는 키가 필요 없다. */
export const hasModel = () =>
  providerId() === "ollama" ? true : Boolean(process.env.ANTHROPIC_API_KEY);

/** Ollama 가 실제로 떠 있는지 — /api/health 가 쓴다 */
export async function probe(): Promise<{ up: boolean; models?: string[]; error?: string }> {
  if (providerId() !== "ollama") {
    return { up: Boolean(process.env.ANTHROPIC_API_KEY) };
  }
  try {
    const res = await fetch(OLLAMA_URL.replace(/\/v1\/?$/, "") + "/api/tags", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { up: false, error: `HTTP ${res.status}` };
    const d = (await res.json()) as { models?: { name: string }[] };
    return { up: true, models: (d.models ?? []).map((m) => m.name) };
  } catch (e) {
    return { up: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* qwen3 는 기본으로 길게 "생각"한다 — 그만큼 느리다.
   프롬프트 끝의 /no_think 가 그 모드를 끈다. 도구를 부르고 결과를 옮기는 일에는
   긴 사고가 필요 없고, 끄면 응답이 몇 배 빨라진다. */
export const promptSuffix = () => (providerId() === "ollama" ? "\n\n/no_think" : "");

/* qwen3 같은 사고형 모델은 <think>…</think> 를 본문에 흘릴 때가 있다.
   사용자에게 보여 줄 글에서는 걷어낸다. */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<think>[\s\S]*$/, "")
    .trim();
}
