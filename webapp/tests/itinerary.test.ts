import { describe, expect, it } from "vitest";
import {
  bestInsert, compute, defaultItinerary, diff, findStop, hm, optimize, toMin, turns, whereAt,
} from "@/lib/itinerary";
import { getRegion } from "@/lib/regions";

/* 일정 계산 — 거리·도착시각·끝나는 시각. 모델은 여기 못 들어온다. 숫자는
   전부 이 결정적 함수들이 내고 모델은 말로 옮기기만 한다(CLAUDE.md 의 규칙).

   그래서 여기가 틀리면 "9시 출발인데 3시에 끝난다" 같은 거짓을 화면이 그대로
   보여 준다. 빌드 때 구워 둔 경주 지역팩으로 실제 좌표·도로망 위에서 잰다. */

const pack = getRegion("gyeongju")!;

describe("시각 바꾸기", () => {
  it("toMin 은 분으로", () => {
    expect(toMin("00:00")).toBe(0);
    expect(toMin("09:30")).toBe(570);
    expect(toMin("23:59")).toBe(1439);
  });

  it("hm 은 다시 시각으로 — 앞자리 0 을 지키고", () => {
    expect(hm(0)).toBe("00:00");
    expect(hm(570)).toBe("09:30");
    expect(hm(1439)).toBe("23:59");
  });

  it("왕복해도 같다", () => {
    for (const t of ["00:00", "07:05", "12:00", "18:45", "23:59"]) {
      expect(hm(toMin(t))).toBe(t);
    }
  });
});

describe("지역팩", () => {
  it("경주팩이 있고 갈 곳이 여러 곳이다", () => {
    expect(pack.pool.length).toBeGreaterThan(5);
  });

  it("없는 지역은 null — 설계 에이전트가 맡는 여행이다", () => {
    expect(getRegion("제주")).toBeNull();
    expect(getRegion(null)).toBeNull();
  });

  it("findStop 은 이름으로 찾는다", () => {
    const first = pack.pool[0];
    expect(findStop(pack, first.name)?.id).toBe(first.id);
    expect(findStop(pack, "없는곳")).toBeNull();
  });
});

describe("compute", () => {
  const items = pack.pool.slice(0, 4).map((s) => s.id);

  it("출발 시각에서 시작한다", () => {
    const p = compute(pack, items, "09:30", false);
    expect(hm(p.rows[0].at)).toBe("09:30");
  });

  it("시각이 뒤로만 간다 — 앞 일정보다 먼저 도착하는 일은 없다", () => {
    const p = compute(pack, items, "09:00", false);
    for (let i = 1; i < p.rows.length; i++) {
      expect(p.rows[i].at).toBeGreaterThanOrEqual(p.rows[i - 1].end);
    }
  });

  it("머무는 시간과 이동을 합치면 끝나는 시각이 나온다", () => {
    const p = compute(pack, items, "09:00", false);
    const last = p.rows[p.rows.length - 1];
    expect(p.endAt).toBe(last.end);
    expect(p.endAt).toBeGreaterThan(toMin("09:00"));
  });

  it("첫 곳에는 이동 구간이 없다", () => {
    const p = compute(pack, items, "09:00", false);
    expect(p.rows[0].leg).toBeNull();
    expect(p.rows[1].leg).not.toBeNull();
  });

  it("빈 일정은 거리 0 이고 끝나는 시각이 출발과 같다", () => {
    const p = compute(pack, [], "09:00", false);
    expect(p.rows).toHaveLength(0);
    expect(p.totalM).toBe(0);
    expect(p.endAt).toBe(toMin("09:00"));
  });

  it("없는 id 는 조용히 건너뛴다 — 지역팩이 바뀌어도 화면이 깨지지 않게", () => {
    const p = compute(pack, [items[0], "없는곳id", items[1]], "09:00", false);
    expect(p.rows).toHaveLength(2);
  });

  it("붐비는 날은 더 오래 걸린다", () => {
    const quiet = compute(pack, items, "09:00", false);
    const busy = compute(pack, items, "09:00", true);
    expect(busy.endAt).toBeGreaterThanOrEqual(quiet.endAt);
  });

  it("순서를 뒤집으면 다른 순서로 계산된다 — 동선이 뜻을 갖는다", () => {
    const a = compute(pack, items, "09:00", false);
    const b = compute(pack, [...items].reverse(), "09:00", false);
    expect(Math.round(a.totalM)).not.toBe(0);
    expect(a.rows.map((r) => r.id)).not.toEqual(b.rows.map((r) => r.id));
  });

  it("출발이 늦으면 전부 그만큼 밀린다", () => {
    const a = compute(pack, items, "09:00", false);
    const b = compute(pack, items, "10:30", false);
    expect(b.endAt - a.endAt).toBe(90);
  });
});

describe("optimize · bestInsert · diff", () => {
  const items = pack.pool.slice(0, 6).map((s) => s.id);

  it("optimize 는 곳을 잃거나 더하지 않는다", () => {
    const next = optimize(pack, items, "09:00", false);
    expect([...next].sort()).toEqual([...items].sort());
  });

  it("optimize 가 거리를 늘리지 않는다", () => {
    const before = compute(pack, items, "09:00", false);
    const after = compute(pack, optimize(pack, items, "09:00", false), "09:00", false);
    expect(after.totalM).toBeLessThanOrEqual(before.totalM + 1);
  });

  it("bestInsert 는 넣을 자리를 범위 안에서 고른다", () => {
    const add = pack.pool[7].id;
    const at = bestInsert(pack, items, add, "09:00", false);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThanOrEqual(items.length);
  });

  it("diff 는 늘고 줄은 양을 알려 준다", () => {
    /* 돌려주는 이름은 dm·dmove·dend 다. 라우트(plan/preview)가 화면에 보낼 때
       m·moveMin·endMin 으로 바꿔 싣는다 — 두 이름을 헷갈리면 undefined 를 비교하고
       통과해 버린다 */
    const before = compute(pack, items, "09:00", false);
    const after = compute(pack, items.slice(0, 4), "09:00", false);
    const d = diff(before, after);
    expect(d.dm).toBeLessThan(0);         // 곳이 줄었으니 거리도 줄어든다
    expect(d.dend).toBeLessThan(0);       // 끝나는 시각도 앞당겨진다
  });

  it("같은 일정의 diff 는 0 이고 '그대로'", () => {
    const p = compute(pack, items, "09:00", false);
    const d = diff(p, p);
    expect([d.dm, d.dmove, d.dend]).toEqual([0, 0, 0]);
    expect(d.verdict).toBe("same");
    expect(d.newProblems).toEqual([]);
  });

  it("많이 돌아가게 되면 손해라고 말한다", () => {
    const before = compute(pack, items.slice(0, 3), "09:00", false);
    /* 멀리 있는 곳을 가운데 끼워 일부러 돌아가게 만든다 */
    const far = pack.pool[pack.pool.length - 1].id;
    const after = compute(pack, [items[0], far, items[1], items[2]], "09:00", false);
    const d = diff(before, after);
    if (d.dm > 400 || d.dend > 25) expect(d.verdict).toBe("bad");
    else expect(["same", "good"]).toContain(d.verdict);
  });
});

describe("whereAt — 사진·지출에 붙는 '그 시각 장소'", () => {
  const items = pack.pool.slice(0, 4).map((s) => s.id);

  it("출발 전에는 아무 곳도 아니다", () => {
    expect(whereAt(pack, items, "09:00", false, "08:00")).toBeNull();
  });

  it("출발 시각에는 첫 곳이다", () => {
    const p = compute(pack, items, "09:00", false);
    expect(whereAt(pack, items, "09:00", false, "09:00")).toBe(p.rows[0].stop.name);
  });

  it("늦은 시각에는 마지막 곳이다", () => {
    const p = compute(pack, items, "09:00", false);
    expect(whereAt(pack, items, "09:00", false, "23:59"))
      .toBe(p.rows[p.rows.length - 1].stop.name);
  });

  it("일정이 비면 null", () => {
    expect(whereAt(pack, [], "09:00", false, "12:00")).toBeNull();
  });
});

describe("turns · defaultItinerary", () => {
  it("길안내 한 걸음마다 거리가 있다", () => {
    const p = compute(pack, pack.pool.slice(0, 3).map((s) => s.id), "09:00", false);
    const leg = p.rows.find((r) => r.leg)?.leg;
    expect(leg).toBeTruthy();
    const steps = turns(pack, leg!);
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) expect(s.m).toBeGreaterThanOrEqual(0);
  });

  it("기본 일정은 그 지역팩의 곳들로 채워진다", () => {
    const d = defaultItinerary(pack, "trip-test");
    expect(d.tripId).toBe("trip-test");
    expect(d.items.length).toBeGreaterThan(0);
    for (const id of d.items) expect(pack.pool.some((s) => s.id === id)).toBe(true);
  });

  it("기본 일정에는 날짜가 없다 — 부르는 쪽이 붙인다", () => {
    expect("date" in defaultItinerary(pack, "trip-test")).toBe(false);
  });
});
