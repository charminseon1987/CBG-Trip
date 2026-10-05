import { fail, ok } from "@/lib/http";
import { getPassData, quote, type Party } from "@/lib/passes";
import { getParkDay } from "@/lib/parkday";
import { guardTrip } from "@/lib/guard";

/** GET /api/trips/:id/passes?visits=4&season=B&adult=2&child=2&renew=0
 *  모델 없이도 도는 결정적 계산. 패스권 에이전트도 같은 함수를 쓴다. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const trip = g.trip;
  if (trip.region !== "everland") {
    return fail("no_pass_data", "지금 패스권 자료가 있는 곳은 에버랜드뿐입니다.", 404);
  }

  const q = new URL(req.url).searchParams;
  const n = (k: string, d = 0) => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d;
  };
  const visits = Math.min(60, Math.max(1, n("visits", 1)));
  const renew = q.get("renew") === "1";

  /* 시즌을 안 줬으면 그 날짜의 실제 등급을 공식 API 에서 가져온다.
     종일권 값이 시즌마다 크게 달라서(D 68,000 vs C 46,000) 추정으로 두면 추천이 틀어진다. */
  let season = (q.get("season") ?? undefined) as "A" | "B" | "C" | "D" | undefined;
  let seasonFrom = "지정값";
  if (!season) {
    const pd = await getParkDay(trip.date);
    if (pd.seasonGrade && "ABCD".includes(pd.seasonGrade)) {
      season = pd.seasonGrade as "A" | "B" | "C" | "D";
      seasonFrom = `공식 운영정보 (${trip.date})`;
    } else {
      seasonFrom = "기본값 — 공식 등급을 받지 못했습니다";
    }
  }

  const given = { adult: n("adult"), child: n("child"), senior: n("senior"), baby: n("baby") };
  const party: Party = (given.adult || given.child || given.senior || given.baby)
    ? given
    : { adult: Math.max(1, trip.people), child: 0, senior: 0, baby: 0 };

  const r = quote("everland", party, visits, season, renew);
  if (!r) return fail("calc_failed", "계산하지 못했습니다.", 500);

  const d = getPassData("everland")!;
  return ok({
    ...r,
    seasonFrom,
    guessedParty: !(given.adult || given.child || given.senior || given.baby),
    disclaimer: `가격은 ${d.asOf} 기준으로 공개 정리 문서에서 옮긴 값입니다. 결제 전 공식 페이지에서 확인하세요.`,
  });
}
