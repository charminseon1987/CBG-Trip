import { z } from "zod";
import { classify, delegate, factsOf, keywordRoute, offlineSay, speak } from "@/agents/chief";
import { hasKey } from "@/agents/harness";
import { AGENTS } from "@/agents/registry";
import { parse } from "@/lib/http";
import { getRegion } from "@/lib/regions";
import { guardTrip } from "@/lib/guard";
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
  const hasMap = Boolean(getRegion(g.trip.region));

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));

      try {
        const route = hasKey() ? await classify(message, hasMap) : keywordRoute(message, hasMap);
        send({ type: "route", agents: route.agents, why: route.why });

        const reports: RunResult[] = [];
        for (const id of route.agents) {
          send({ type: "handoff", agent: id, name: AGENTS[id]?.name ?? id });
          const r = await delegate(id, { tripId }, message);
          reports.push(r);
          send({ type: "report", agent: id, text: r.text, calls: r.calls });
        }

        if (!hasKey()) {
          send({ type: "text", delta: offlineSay(reports) });
          send({ type: "done", offline: true });
          controller.close();
          return;
        }

        const facts = await factsOf(tripId);
        const out = speak({ tripId }, message, reports, facts);
        for await (const delta of out.textStream) send({ type: "text", delta });
        send({ type: "done" });
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
