import { modelName, probe, providerId } from "@/agents/provider";
import { agentList } from "@/agents/registry";
import { ok } from "@/lib/http";
import { storeKind } from "@/lib/store";
import { regionKeys } from "@/lib/regions";

/** GET /api/health — 살아 있는지, 무엇이 붙어 있는지 */
export async function GET() {
  const p = await probe();
  return ok({
    status: "ok",
    provider: providerId(),
    model: p.up ? "connected" : "unavailable",
    models: { quick: modelName("quick"), default: modelName("default") },
    installed: p.models,
    providerError: p.error,
    store: storeKind(),
    regions: regionKeys(),
    agents: agentList().map((a) => a.id),
    time: new Date().toISOString(),
  });
}
