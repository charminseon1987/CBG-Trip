import { fail, ok } from "@/lib/http";
import { getDayInfo } from "@/lib/dayinfo";
import { guardTrip } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** GET /api/trips/:id/dayinfo?date=2026-10-03&only=closed
 *  그날 무엇이 열고 닫는지. 서버가 공식 API 를 불러 30분 캐시한다. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const trip = g.trip;
  if (trip.region !== "everland") {
    return fail("no_dayinfo", "일별 운영정보는 지금 에버랜드만 제공합니다.", 404);
  }

  const q = new URL(req.url).searchParams;
  const date = q.get("date") ?? trip.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail("bad_date", "날짜는 YYYY-MM-DD 형식이어야 합니다.", 422);
  }

  const info = await getDayInfo(date, q.get("force") === "1");
  const only = q.get("only");
  const cat = q.get("category");

  let facilities = info.facilities;
  if (only === "closed") facilities = facilities.filter((f) => f.status !== "open");
  if (only === "shows") facilities = facilities.filter((f) => f.category.includes("공연"));
  if (cat) facilities = facilities.filter((f) => f.category.includes(cat));

  return ok({ ...info, facilities, shown: facilities.length });
}
