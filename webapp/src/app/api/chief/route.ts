import { z } from "zod";
import { classify, delegate, factsOf, keywordRoute, offlineSay, speak } from "@/agents/chief";
import { hasKey } from "@/agents/harness";
import { AGENTS } from "@/agents/registry";
import { fail, parse } from "@/lib/http";
import { rateLimit } from "@/lib/auth";
import { logAgentRun } from "@/lib/stats";
import { getRegion } from "@/lib/regions";
import { guardTrip } from "@/lib/guard";
import { modelName, providerId } from "@/agents/provider";
import type { RunResult } from "@/agents/harness";

export const maxDuration = 60;

const Body = z.object({
  tripId: z.string().min(1),
  message: z.string().min(1).max(2000),
});

/** POST /api/chief — 총괄에게 말을 건다.
 *
 *  응답은 NDJSON 스트림이다. 화면은 한 줄씩 읽어 그대로 그린다.
 *    {"type":"route","agents":["plan"],"why":"..."}
 *    {"type":"handoff","agent":"plan","name":"일정"}
 *    {"type":"report","agent":"plan","text":"...","calls":[...]}
 *    {"type":"text","delta":"총괄이 "}
 *    {"type":"done"}
 */
export async function POST(req: Request) {
  const p = await parse(req, Body);
  if (!p.ok) return p.res;
  const { tripId, message } = p.data;

  const g = await guardTrip(tripId);
  if (!g.ok) return g.res;

  /* 모델을 부르는 길은 한 번에 돈과 시간이 든다 — 사람마다 분당 횟수를 센다 */
  const over = rateLimit(`chief:${g.user?.id ?? "anon"}`);
  if (over) return fail("too_many", over, 429);
  const hasMap = Boolean(getRegion(g.trip.region));

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));

      try {
        /* 누가 불렀는지를 ctx 로 넘긴다 — 토큰 장부(agent_runs)에 남는다 */
        const ctx = { tripId, userId: g.user?.id };
        const route = hasKey()
          ? await classify(message, hasMap, ctx)
          : keywordRoute(message, hasMap);
        /* 이름을 함께 보낸다 — 화면이 명부를 또 적어 두면 여기와 엇갈린다 */
        send({
          type: "route",
          agents: route.agents,
          names: route.agents.map((id) => AGENTS[id]?.name ?? id),
          why: route.why,
        });

        const reports: RunResult[] = [];
        for (const id of route.agents) {
          send({ type: "handoff", agent: id, name: AGENTS[id]?.name ?? id });
          const r = await delegate(id, ctx, message);
          reports.push(r);
          send({
            type: "report", agent: id, text: r.text, calls: r.calls,
            tier: r.tier, model: r.model, ms: r.ms,
          });
        }

        if (!hasKey()) {
          send({ type: "text", delta: offlineSay(reports) });
          send({ type: "done", offline: true });
          controller.close();
          return;
        }

        const facts = await factsOf(tripId);
        const t0 = Date.now();
        const out = speak(ctx, message, reports, facts);
        for await (const delta of out.textStream) send({ type: "text", delta });
        send({ type: "done" });

        /* 총괄의 말도 모델 호출이다. 스트림이 끝나야 usage 를 알 수 있으니
           여기서 기다려 장부에 적는다 — 담당 호출만 세면 총괄 몫이 빠진다 */
        const u = await out.totalUsage.catch(() => undefined);
        await logAgentRun({
          agent: "chief", tripId, userId: g.user?.id,
          tier: "quick", model: modelName("quick"), provider: providerId(),
          inputTokens: u?.inputTokens, outputTokens: u?.outputTokens,
          ms: Date.now() - t0, toolCalls: 0,
        });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
