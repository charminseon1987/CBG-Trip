/* ============================================================
   에이전트 프롬프트 — 에이전트 하나당 .md 파일 하나.

   프롬프트는 코드가 아니라 글이다. 그래서 마크다운으로 두고 여기서 읽는다.
   .md 만 고치면 도구·라우트는 건드릴 필요가 없다.

   쓰는 원칙
   - 역할을 한 문장으로 못 박고, 하지 않을 일을 명시한다
   - 그 에이전트가 늘 신경 써야 하는 도메인 제약을 적는다
   - 어떤 도구를 언제 부를지 짧게 안내한다 (도구 설명과 중복시키지 않는다)
   - 숫자를 지어내지 말라는 규칙은 하네스의 GROUND_RULES 가 공통으로 붙인다

   파일 앞머리(front matter)는 사람이 읽기 위한 메모다. 모델에게는 보내지 않는다.

   배포: next.config.ts 의 outputFileTracingIncludes 가 이 .md 들을 번들에 넣는다.
   ============================================================ */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PromptId = "chief" | "plan" | "designer" | "album" | "ledger" | "pass" | "diary";

const DIR = join(process.cwd(), "src", "agents", "prompts");
const cache = new Map<PromptId, string>();

/** 앞머리(--- … ---)와 주석을 걷어낸 본문만 모델에게 보낸다 */
function strip(md: string): string {
  return md
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

/**
 * 프롬프트를 읽는다.
 * 개발 중에는 매번 파일을 다시 읽어, .md 를 고치면 서버를 껐다 켜지 않아도 반영된다.
 * 배포에서는 한 번만 읽고 캐시한다.
 */
export function readPrompt(id: PromptId): string {
  const dev = process.env.NODE_ENV !== "production";
  if (!dev) {
    const hit = cache.get(id);
    if (hit) return hit;
  }
  try {
    const text = strip(readFileSync(join(DIR, `${id}.md`), "utf8"));
    cache.set(id, text);
    return text;
  } catch (e) {
    // 프롬프트를 못 읽으면 그 에이전트가 제 역할을 모른 채 답하게 된다. 조용히 넘기지 않는다.
    throw new Error(
      `프롬프트 파일을 읽지 못했습니다: src/agents/prompts/${id}.md — ` +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

/* 등록부가 쓰는 형태. 함수로 두어 개발 중 수정이 바로 반영되게 한다. */
export const CHIEF = () => readPrompt("chief");
export const PLAN = () => readPrompt("plan");
export const DESIGNER = () => readPrompt("designer");
export const ALBUM = () => readPrompt("album");
export const LEDGER = () => readPrompt("ledger");
export const PASS = () => readPrompt("pass");
export const DIARY = () => readPrompt("diary");
