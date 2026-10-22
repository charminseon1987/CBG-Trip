import { fail, ok } from "@/lib/http";
import { currentUser } from "@/lib/auth";
import { adminStats } from "@/lib/stats";
import { storeKind } from "@/lib/store";
import { hasModel, isLocal, modelName, providerId } from "@/agents/provider";

export const dynamic = "force-dynamic";

/** GET /api/admin/stats — 관리 화면의 집계 (관리자만).
 *  카운트·토큰 장부 합계와 지금 붙어 있는 모델 설정을 함께 돌려준다. */
export async function GET() {
  const me = await currentUser();
  if (me?.role !== "admin") return fail("forbidden", "관리자만 볼 수 있습니다.", 403);

  const stats = await adminStats();
  return ok({
    ...stats,
    runtime: {
      store: storeKind(),
      provider: providerId(),
      hasModel: hasModel(),
      local: isLocal(),
      models: { quick: modelName("quick"), default: modelName("default") },
    },
  });
}
