import { fail, notFound, ok } from "@/lib/http";
import { getParkDay } from "@/lib/parkday";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** GET /api/trips/:id/parkday?date=YYYY-MM-DD
 *  그날의 날짜·요일·날씨·운영시간·시즌 등급. 모델 없이 돈다. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const trip = await store.getTrip(id);
  if (!trip) return notFound("여행");
  if (trip.region !== "everland") {
    return fail("no_parkday", "날씨·운영시간은 지금 에버랜드만 제공합니다.", 404);
  }
  const date = new URL(req.url).searchParams.get("date") ?? trip.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail("bad_date", "날짜는 YYYY-MM-DD 형식이어야 합니다.", 422);
  }
  return ok(await getParkDay(date));
}
