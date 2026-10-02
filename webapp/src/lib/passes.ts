/* ============================================================
   패스권 계산 — 추천의 근거가 되는 산수를 전부 여기서 한다.
   모델은 이 결과를 말로 옮기기만 하고, 숫자를 만들지 않는다.
   ============================================================ */
import everland from "@data/passes/everland.json";

export interface Party {
  adult: number;   // 대인·청소년
  child: number;   // 소인 (36개월~만 12세)
  senior: number;  // 경로
  baby: number;    // 36개월 미만
}

export type Band = keyof Party;

export interface PassData {
  park: string; title: string; asOf: string; verifyUrl: string;
  reliability: string; sourceNote: string;
  sources: { label: string; url: string }[];
  ageBands: { id: string; name: string; rule: string }[];
  dayTicket: {
    name: string; note: string; defaultSeason: string;
    seasons: { id: string; name: string; adult: number; child: number; senior: number; baby: number }[];
  };
  passes: {
    id: string; name: string; days: number; weekdayOnly: boolean;
    ageOnly?: string;
    price: Partial<Record<Band, number>>;
    renewPrice?: Partial<Record<Band, number>>;
    perks: string[]; bestFor: string;
  }[];
  addons: {
    id: string; name: string; kind: string; note: string;
    priceRange: { offPeak: [number, number]; peak: [number, number] };
    unit: string; variants: string[]; facilities: string[];
  }[];
}

const PARKS: Record<string, PassData> = { everland: everland as unknown as PassData };

export const getPassData = (park: string): PassData | null => PARKS[park] ?? null;

export const partySize = (p: Party) => p.adult + p.child + p.senior + p.baby;

/** 종일권 1회 총액 */
export function dayTotal(d: PassData, party: Party, seasonId?: string) {
  const s = d.dayTicket.seasons.find((x) => x.id === (seasonId ?? d.dayTicket.defaultSeason))
    ?? d.dayTicket.seasons[0];
  const total =
    party.adult * s.adult + party.child * s.child + party.senior * s.senior + party.baby * s.baby;
  return { season: s, perVisit: total };
}

/** 정기권 하나를 이 일행이 사면 얼마인가. 해당 나이대가 없으면 null. */
export function passTotal(p: PassData["passes"][number], party: Party, renew = false) {
  const table = (renew && p.renewPrice) ? { ...p.price, ...p.renewPrice } : p.price;

  if (p.ageOnly) {
    const band = p.ageOnly as Band;
    const n = party[band];
    const unit = table[band];
    if (!n || unit == null) return null;
    return { total: n * unit, covers: { [band]: n } as Partial<Party>, uncovered: subtract(party, band, n) };
  }

  // 일반 정기권은 대인·소인 가격만 있다. 경로·베이비는 전용 상품으로 빠진다.
  let total = 0;
  const covers: Partial<Party> = {};
  for (const band of ["adult", "child"] as Band[]) {
    const n = party[band];
    const unit = table[band];
    if (!n) continue;
    if (unit == null) return null;
    total += n * unit;
    covers[band] = n;
  }
  if (!total) return null;
  const uncovered: Party = { ...party, adult: 0, child: 0 };
  return { total, covers, uncovered };
}

function subtract(party: Party, band: Band, n: number): Party {
  return { ...party, [band]: Math.max(0, party[band] - n) };
}

export interface Option {
  id: string;
  name: string;
  kind: "day" | "pass";
  /** 1년에 visits 번 갈 때의 총액 */
  total: number;
  /** 종일권 대비 아끼는 금액 (양수면 이득) */
  saves: number;
  /** 몇 번부터 종일권보다 싸지는가 */
  breakEven: number | null;
  weekdayOnly: boolean;
  perks: string[];
  bestFor: string;
  /** 이 상품이 못 덮는 인원 — 그만큼 종일권을 따로 사야 한다 */
  uncoveredCost: number;
  note?: string;
}

/** 방문 횟수를 주면 종일권과 모든 정기권을 같은 자로 비교한다 */
export function quote(
  park: string, party: Party, visits: number, seasonId?: string, renew = false,
) {
  const d = getPassData(park);
  if (!d) return null;

  const { season, perVisit } = dayTotal(d, party, seasonId);
  const dayCost = perVisit * visits;

  const options: Option[] = [
    {
      id: "day", name: `${d.dayTicket.name} ${visits}회`, kind: "day",
      total: dayCost, saves: 0, breakEven: null, weekdayOnly: false,
      perks: [], bestFor: "연 1~3회 — 제휴 할인·카드 할인을 챙기면 더 싸집니다",
      uncoveredCost: 0,
    },
  ];

  for (const p of d.passes) {
    const r = passTotal(p, party, renew);
    if (!r) continue;
    const uncoveredPerVisit = dayTotal(d, r.uncovered, seasonId).perVisit;
    const uncoveredCost = uncoveredPerVisit * visits;
    const total = r.total + uncoveredCost;
    // 손익분기: 정기권 고정비를 1회 종일권 절감액으로 나눈다
    const savedPerVisit = perVisit - uncoveredPerVisit;
    const breakEven = savedPerVisit > 0 ? Math.ceil(r.total / savedPerVisit) : null;
    options.push({
      id: p.id, name: p.name, kind: "pass", total,
      saves: dayCost - total, breakEven,
      weekdayOnly: p.weekdayOnly, perks: p.perks, bestFor: p.bestFor,
      uncoveredCost,
      note: p.weekdayOnly
        ? "평일에만 쓸 수 있습니다. 주말·공휴일에 갈 계획이면 고를 수 없습니다."
        : uncoveredCost > 0
        ? "이 상품이 못 덮는 인원은 종일권을 따로 사는 비용까지 더한 금액입니다."
        : undefined,
    });
  }

  options.sort((a, b) => a.total - b.total);
  const best = options[0];
  const mix = bestMix(park, party, visits, seasonId, renew, false);        // 주말에도 갈 수 있어야 할 때
  const mixWeekday = bestMix(park, party, visits, seasonId, renew, true);  // 평일에만 갈 수 있다면

  return {
    park: d.title,
    party, visits,
    season: { id: season.id, name: season.name },
    perVisit,
    dayCost,
    options,
    best: { id: best.id, name: best.name, total: best.total, saves: best.saves },
    /* 사람마다 다른 권종을 섞었을 때의 최저가 — 보통 이게 진짜 답이다.
       위크데이 정기권은 주말에 못 쓰므로 기본(bestMix)에서는 제외한다. */
    bestMix: mix,
    bestMixIfWeekdayOnly: mixWeekday,
    addons: d.addons,
    asOf: d.asOf,
    verifyUrl: d.verifyUrl,
    reliability: d.reliability,
    sourceNote: d.sourceNote,
    sources: d.sources,
  };
}

/* ============================================================
   사람마다 다른 권종을 사는 것이 보통 가장 싸다.
   (어른은 위크데이 정기권, 할아버지는 시니어권, 아기는 그냥 종일권 …)
   나이대별로 가장 싼 선택을 골라 조합한다.
   ============================================================ */
export interface MixLine {
  band: Band;
  bandName: string;
  count: number;
  choice: string;        // 상품 이름
  unit: number;          // 1인당 금액 (정기권은 연회비, 종일권은 visits 회 합)
  subtotal: number;
}

export function bestMix(
  park: string, party: Party, visits: number, seasonId?: string, renew = false,
  weekdayOnlyOk = false,          /* 평일에만 갈 수 있는 집인가 */
) {
  const d = getPassData(park);
  if (!d) return null;
  const { season } = dayTotal(d, party, seasonId);
  const dayUnit: Record<Band, number> = {
    adult: season.adult, child: season.child, senior: season.senior, baby: season.baby,
  };

  const lines: MixLine[] = [];
  for (const band of ["adult", "child", "senior", "baby"] as Band[]) {
    const n = party[band];
    if (!n) continue;

    // 후보 1) 종일권 visits 회
    let choice = `${d.dayTicket.name} ${visits}회`;
    let unit = dayUnit[band] * visits;

    // 후보 2) 이 나이대를 덮는 정기권들
    for (const p of d.passes) {
      if (p.ageOnly && p.ageOnly !== band) continue;
      if (p.weekdayOnly && !weekdayOnlyOk) continue;   /* 주말에 가면 못 쓰는 권종은 뺀다 */
      const table = (renew && p.renewPrice) ? { ...p.price, ...p.renewPrice } : p.price;
      const u = table[band];
      if (u == null) continue;
      if (u < unit) { unit = u; choice = p.name; }
    }

    lines.push({
      band,
      bandName: d.ageBands.find((a) => a.id === band)?.name ?? band,
      count: n, choice, unit, subtotal: unit * n,
    });
  }

  const total = lines.reduce((s2, l) => s2 + l.subtotal, 0);
  const allDay = dayTotal(d, party, seasonId).perVisit * visits;
  return {
    visits,
    season: { id: season.id, name: season.name },
    lines,
    total,
    allDay,
    saves: allDay - total,
    mixed: new Set(lines.map((l) => l.choice)).size > 1,
    weekdayOnlyOk,
  };
}
