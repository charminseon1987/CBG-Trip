import { fail, notFound, ok } from "@/lib/http";
import { getPassData, quote, type Party } from "@/lib/passes";
import { store } from "@/lib/store";

/** GET /api/trips/:id/passes?visits=4&season=B&adult=2&child=2&renew=0
 *  모델 없이도 도는 결정적 계산. 패스권 에이전트도 같은 함수를 쓴다. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const trip = await store.getTrip(id);
  if (!trip) return notFound("여행");
  if (trip.region !== "everland") {
    return fail("no_pass_data", "지금 패스권 자료가 있는 곳은 에버랜드뿐입니다.", 404);
  }

  const q = new URL(req.url).searchParams;
  const n = (k: string, d = 0) => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d;
  };
  const visits = Math.min(60, Math.max(1, n("visits", 1)));
  const season = (q.get("season") ?? undefined) as "A" | "B" | "C" | "D" | undefined;
  const renew = q.get("renew") === "1";

  const given = { adult: n("adult"), child: n("child"), senior: n("senior"), baby: n("baby") };
  const party: Party = (given.adult || given.child || given.senior || given.baby)
    ? given
    : { adult: Math.max(1, trip.people), child: 0, senior: 0, baby: 0 };

  const r = quote("everland", party, visits, season, renew);
  if (!r) return fail("calc_failed", "계산하지 못했습니다.", 500);

  const d = getPassData("everland")!;
  return ok({
    ...r,
    guessedParty: !(given.adult || given.child || given.senior || given.baby),
    disclaimer: `가격은 ${d.asOf} 기준으로 공개 정리 문서에서 옮긴 값입니다. 결제 전 공식 페이지에서 확인하세요.`,
  });
}
