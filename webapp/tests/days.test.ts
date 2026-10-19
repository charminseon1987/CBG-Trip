import { describe, expect, it } from "vitest";
import { DATE_RE, dayLabel, diaryDate, eachDate, tripDays } from "@/lib/days";

/* 날짜 계산. 여행이 하루가 아니게 된 뒤로 여기가 모든 날짜 띠의 바닥이다 —
   일정·사진·가계부가 다 이걸 쓴다.

   시간대가 섞이면 하루가 밀린다. 그래서 전부 UTC 자정 기준인데, 그게 정말
   그런지 재는 것이 이 파일의 절반이다. */

describe("eachDate", () => {
  it("하루 여행은 한 칸", () => {
    expect(eachDate("2026-11-01", "2026-11-01")).toEqual(["2026-11-01"]);
  });

  it("2박3일은 세 칸", () => {
    expect(eachDate("2026-11-01", "2026-11-03"))
      .toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("7박8일은 여덟 칸", () => {
    expect(eachDate("2026-12-01", "2026-12-08")).toHaveLength(8);
  });

  it("달을 넘어도 센다", () => {
    expect(eachDate("2026-10-30", "2026-11-02"))
      .toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("윤년 2월 29일을 건너뛰지 않는다", () => {
    expect(eachDate("2028-02-28", "2028-03-01"))
      .toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });

  it("끝이 시작보다 앞이면 하루만 — 거꾸로 세지 않는다", () => {
    expect(eachDate("2026-11-05", "2026-11-01")).toEqual(["2026-11-05"]);
  });

  it("31일에서 멈춘다 — 잘못 넣은 기간으로 메모리를 먹지 않게", () => {
    expect(eachDate("2026-01-01", "2030-01-01")).toHaveLength(31);
  });

  it("날짜꼴이 아니면 빈 배열", () => {
    expect(eachDate("2026/11/01", "2026-11-02")).toEqual([]);
    expect(eachDate("", "")).toEqual([]);
  });
});

describe("tripDays", () => {
  const trip = { date: "2026-11-01", end: "2026-11-03" };

  it("여행 기간은 1·2·3일차로 센다", () => {
    expect(tripDays(trip, []).map((d) => d.day)).toEqual([1, 2, 3]);
  });

  it("기간 밖에 찍힌 사진 날짜도 칸을 얻지만 일차는 null 이다", () => {
    const got = tripDays(trip, ["2026-10-31", "2026-11-09"]);
    expect(got.map((d) => d.date)).toEqual([
      "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-09",
    ]);
    expect(got[0].day).toBeNull();
    expect(got[4].day).toBeNull();
  });

  it("같은 날짜가 여러 장이어도 칸은 하나", () => {
    const got = tripDays(trip, ["2026-11-02", "2026-11-02", "2026-11-02"]);
    expect(got).toHaveLength(3);
  });

  it("날짜꼴이 아닌 값은 버린다", () => {
    const got = tripDays(trip, ["", "어제", "2026-11-02"]);
    expect(got.map((d) => d.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("기간을 줄이면 그 날은 '기간 밖'으로 남는다 (지우지 않는다)", () => {
    const shrunk = tripDays({ date: "2026-11-01", end: "2026-11-01" }, ["2026-11-02"]);
    expect(shrunk.map((d) => [d.date, d.day])).toEqual([
      ["2026-11-01", 1],
      ["2026-11-02", null],
    ]);
  });
});

describe("이름 붙이기", () => {
  it("dayLabel 은 월·일·요일", () => {
    /* 2026-11-01 은 일요일 */
    expect(dayLabel("2026-11-01")).toBe("11월 1일 (일)");
  });

  it("diaryDate 는 일기 머리꼴", () => {
    expect(diaryDate("2026-11-01")).toBe("2026. 11. 1. 일요일");
  });

  it("시간대 때문에 하루가 밀리지 않는다", () => {
    /* 자정 경계를 UTC 로 세지 않으면 여기서 10월 31일이 나온다 */
    expect(dayLabel("2026-11-01").startsWith("11월 1일")).toBe(true);
  });
});

describe("DATE_RE", () => {
  it("YYYY-MM-DD 만 받는다", () => {
    expect(DATE_RE.test("2026-11-01")).toBe(true);
    expect(DATE_RE.test("2026-1-1")).toBe(false);
    expect(DATE_RE.test("26-11-01")).toBe(false);
    expect(DATE_RE.test("")).toBe(false);
  });
});
