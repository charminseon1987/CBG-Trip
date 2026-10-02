import { notFound, ok } from "@/lib/http";
import { getRegion } from "@/lib/regions";

/** GET /api/regions/:key — 지역팩 전체 (지도 SVG·노드·간선 포함).
 *  ?light=1 이면 지도 데이터를 빼고 장소 목록만 준다. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const pack = getRegion(key);
  if (!pack) return notFound("지역");
  if (new URL(req.url).searchParams.get("light")) {
    const { nodes, edges, base, ...rest } = pack;
    void nodes; void edges; void base;
    return ok(rest);
  }
  return ok(pack);
}
