import { ok } from "@/lib/http";
import { getRegion, regionKeys, regionSummary } from "@/lib/regions";

/** GET /api/regions — 지원하는 지역 요약 (지도·노드 제외) */
export async function GET() {
  const list = regionKeys()
    .map((k) => getRegion(k))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map(regionSummary);
  return ok({ regions: list });
}
