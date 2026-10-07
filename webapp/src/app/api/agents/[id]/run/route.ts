import { z } from "zod";
import { delegate } from "@/agents/chief";
import { hasKey } from "@/agents/harness";
import { AGENTS } from "@/agents/registry";
import { fail, notFound, ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { rateLimit } from "@/lib/auth";

export const maxDuration = 60;

const Body = z.object({
  tripId: z.string().min(1),
  task: z.string().min(1).max(2000),
});

/** POST /api/agents/:id/run — 담당 하나를 직접 돌린다 (총괄을 거치지 않음).
 *  무슨 도구를 어떤 입력으로 불렀는지 calls 에 그대로 담아 돌려준다. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!AGENTS[id]) return notFound("에이전트");
  if (!hasKey()) return fail("no_model", "ANTHROPIC_API_KEY 가 설정되지 않았습니다.", 503);

  const p = await parse(req, Body);
  if (!p.ok) return p.res;
  const g = await guardTrip(p.data.tripId);
  if (!g.ok) return g.res;

  /* 총괄과 같은 이유로 횟수를 센다 — 담당을 직접 부르는 길도 결국 모델을 부른다 */
  const over = rateLimit(`agent:${g.user?.id ?? "anon"}`);
  if (over) return fail("too_many", over, 429);

  const r = await delegate(id, { tripId: p.data.tripId }, p.data.task);
  return ok({
    agent: r.agent, text: r.text, calls: r.calls,
    tier: r.tier, model: r.model, provider: r.provider, ms: r.ms, usage: r.usage,
  });
}
