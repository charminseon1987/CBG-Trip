import { currentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { searchTrips } from "@/lib/joins";

export const dynamic = "force-dynamic";

/** GET /api/trips/search?q=경주 — 주인이 "찾을 수 있게" 를 켠 여행만.
 *
 *  제목·지역·날짜·인원까지만 내준다. 일정·사진·가계부는 승인 뒤에만 보인다.
 *  두 자 미만이면 빈 목록이다 — 빈 검색으로 전체 목록을 쓸어 가지 못하게. */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return fail("unauthorized", "로그인이 필요합니다.", 401);
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return ok({ q, trips: await searchTrips(q, me.id) });
}
