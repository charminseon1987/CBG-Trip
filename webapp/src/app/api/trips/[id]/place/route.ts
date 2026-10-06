import { fail, notFound, ok } from "@/lib/http";
import { getRegion } from "@/lib/regions";
import { guardTrip } from "@/lib/guard";
import { placeDetail } from "@/lib/places";

export const dynamic = "force-dynamic";

/** GET /api/trips/:id/place?id=bulguksa
 *  일정 카드나 지도 핀을 눌렀을 때 뜨는 그 장소의 특징·역사·사진.
 *  상세는 빌드 때 구워 둔 JSON 이라 네트워크를 타지 않는다. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;

  const placeId = new URL(req.url).searchParams.get("id");
  if (!placeId) return fail("no_place", "장소 id 가 필요합니다.", 422);

  const pack = getRegion(g.trip.region);
  if (!pack) return fail("no_region", "이 여행에는 아직 지도 데이터가 없습니다.", 404);

  const poi = pack.pool.find((p) => p.id === placeId);
  if (!poi) return notFound("장소");

  const d = placeDetail(g.trip.region, placeId);
  return ok({
    id: poi.id,
    name: poi.name,
    zone: poi.zl ?? poi.zone,
    zoneId: poi.zone,
    kind: poi.kind ?? null,
    lat: poi.lat ?? null,
    lng: poi.lng ?? null,
    /* 특징은 지역팩이 늘 쥐고 있다 — 위키백과에 항목이 없는 곳도 비지 않는다 */
    tip: d?.tip || poi.note || "",
    stay: d?.stay ?? poi.stay ?? null,
    open: poi.open || "",
    close: poi.close || "",
    about: d?.about || "",
    history: d?.history || "",
    img: d?.img || "",
    credit: d?.credit ?? null,
    wiki: d?.wiki || "",
    /* 위키백과에 항목이 없어 사진·역사를 넣지 못한 곳임을 화면이 알 수 있게 */
    source: d?.wiki ? "위키백과" : pack.source,
  });
}
