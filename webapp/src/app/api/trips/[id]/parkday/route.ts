import { fail, ok } from "@/lib/http";
import { getParkDay } from "@/lib/parkday";
import { guardTrip } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** GET /api/trips/:id/parkday?date=YYYY-MM-DD
 *  그날의 날짜·요일·날씨·운영시간·시즌 등급. 모델 없이 돈다. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const trip = g.trip;
  if (!trip.region) {
    return fail("no_parkday", "지역이 정해지지 않은 여행입니다.", 404);
  }
  const date = new URL(req.url).searchParams.get("date") ?? trip.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail("bad_date", "날짜는 YYYY-MM-DD 형식이어야 합니다.", 422);
  }
  return ok(await getParkDay(date, trip.region));
}
