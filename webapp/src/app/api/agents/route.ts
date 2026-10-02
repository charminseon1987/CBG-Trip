import { hasKey } from "@/agents/harness";
import { agentList } from "@/agents/registry";
import { ok } from "@/lib/http";

/** GET /api/agents — 명부. 누가 있고 무슨 도구를 쥐고 있는지. */
export async function GET() {
  return ok({ agents: agentList(), model: hasKey() ? "connected" : "no_key" });
}
