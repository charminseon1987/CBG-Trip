import { describe, expect, it } from "vitest";
import { guessCategory, parseCardCsv, parseCardSms, toCsv } from "@/lib/cardimport";

/* 카드 명세서 읽기. 카드사 API 를 못 쓰니(마이데이터 허가가 필요하다) 사람이
   내려받은 CSV 와 결제 문자를 읽는 것이 가계부의 유일한 입구다.

   여기가 틀리면 금액이나 날짜가 조용히 틀린 채로 들어간다 — 사람이 표를 다시
   읽지 않으면 모른다. 그래서 꼴이 다른 명세서를 여럿 넣어 본다. */

describe("guessCategory", () => {
  it("에버랜드·입장권은 ticket", () => {
    expect(guessCategory("에버랜드").category).toBe("ticket");
    expect(guessCategory("롯데월드 자유이용권").category).toBe("ticket");
  });

  it("주차·주유·톨게이트는 car", () => {
    expect(guessCategory("하이패스 통행료").category).toBe("car");
    expect(guessCategory("GS칼텍스 셀프").category).toBe("car");
  });

  it("카페·편의점은 snack, 식당은 food", () => {
    expect(guessCategory("스타벅스 경주보문").category).toBe("snack");
    expect(guessCategory("황리단길국밥").category).toBe("food");
  });

  it("모르는 곳은 etc 이고 추측했다고 표시한다", () => {
    const g = guessCategory("ABCD1234");
    expect(g.category).toBe("etc");
    expect(g.guessed).toBe(true);
  });

  it("알아낸 분류는 추측이 아니다 — 사람이 다시 볼 필요가 없다", () => {
    expect(guessCategory("에버랜드").guessed).toBe(false);
  });
});

describe("parseCardCsv", () => {
  it("머리글이 있으면 열 이름으로 찾는다", () => {
    const csv = [
      "이용일,이용시간,가맹점,이용금액",
      "2026-11-01,09:20,에버랜드,64000",
      "2026-11-01,12:40,황리단길국밥,38000",
    ].join("\n");
    const r = parseCardCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({
      date: "2026-11-01", at: "09:20", amount: 64000, merchant: "에버랜드", category: "ticket",
    });
    expect(r.note).toContain("머리글");
  });

  it("금액의 쉼표·원 표시를 걷어낸다", () => {
    const r = parseCardCsv([
      "이용일,시간,가맹점,금액",
      "2026-11-01,10:00,카페,\"12,500원\"",
    ].join("\n"));
    expect(r.rows[0].amount).toBe(12500);
  });

  it("환불(음수)은 절댓값으로 넣는다", () => {
    const r = parseCardCsv([
      "이용일,시간,가맹점,금액",
      "2026-11-01,10:00,카페,-4000",
    ].join("\n"));
    expect(r.rows[0].amount).toBe(4000);
  });

  it("금액 0 인 줄은 건너뛴다 — 취소나 합계 줄이다", () => {
    const r = parseCardCsv([
      "이용일,시간,가맹점,금액",
      "2026-11-01,10:00,카페,5000",
      "2026-11-02,11:00,합계,0",
    ].join("\n"));
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });

  it("따옴표 안의 쉼표는 가맹점 이름을 쪼개지 않는다", () => {
    const r = parseCardCsv([
      "이용일,시간,가맹점,금액",
      "2026-11-01,10:00,\"카페, 경주점\",5000",
    ].join("\n"));
    expect(r.rows[0].merchant).toBe("카페, 경주점");
  });

  it("탭으로 나뉜 것도 읽는다", () => {
    const r = parseCardCsv("이용일\t시간\t가맹점\t금액\n2026-11-01\t10:00\t에버랜드\t64000");
    expect(r.rows[0].amount).toBe(64000);
  });

  it("머리글이 없으면 값 모양으로 짐작한다", () => {
    const r = parseCardCsv("2026-11-01,09:20,에버랜드,64000");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].merchant).toBe("에버랜드");
    expect(r.note).toContain("추측");
  });

  it("빈 내용은 빈 결과와 까닭", () => {
    const r = parseCardCsv("");
    expect(r.rows).toEqual([]);
    expect(r.note).toContain("비어");
  });

  it("시각이 없으면 12:00 으로 두고 날짜는 지킨다", () => {
    const r = parseCardCsv("이용일,가맹점,금액\n2026-11-01,에버랜드,64000");
    expect(r.rows[0].at).toBe("12:00");
    expect(r.rows[0].date).toBe("2026-11-01");
  });
});

describe("parseCardSms", () => {
  it("결제 알림 문자 한 줄에서 금액·시각·가맹점을 뽑는다", () => {
    const r = parseCardSms("[Web발신] KB국민카드 승인 홍*동 13,500원 일시불 10/03 13:42 황리단길포차");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ amount: 13500, at: "13:42", merchant: "황리단길포차" });
    expect(r.rows[0].date?.endsWith("-10-03")).toBe(true);
  });

  it("여러 줄을 한 번에", () => {
    const r = parseCardSms([
      "[Web발신] 신한카드 승인 5,000원 10/03 09:10 에버랜드",
      "[Web발신] 신한카드 승인 7,000원 10/03 12:00 푸드코트",
    ].join("\n"));
    expect(r.rows.map((x) => x.amount)).toEqual([5000, 7000]);
  });

  it("금액이 없는 줄은 건너뛴다", () => {
    const r = parseCardSms([
      "[Web발신] 카드 이용 안내입니다",
      "[Web발신] 승인 5,000원 10/03 09:10 에버랜드",
    ].join("\n"));
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });

  it("가린 이름(홍*동)을 가맹점으로 잘못 잡지 않는다", () => {
    const r = parseCardSms("[Web발신] 승인 홍*동 9,000원 10/03 09:10 오죽헌");
    expect(r.rows[0].merchant).toBe("오죽헌");
  });
});

describe("toCsv", () => {
  const rows = [
    { date: "2026-11-01", at: "09:20", category: "ticket", merchant: "에버랜드", amount: 64000, place: "정문" },
    { date: "2026-11-02", at: "12:40", category: "food", merchant: "국밥\"집\"", amount: 9000, place: null },
  ];

  it("머리글에 날짜가 있다 — 여러 날 여행에서 날짜 없이 내보내면 쓸 수 없다", () => {
    expect(toCsv(rows).split("\r\n")[0]).toContain("날짜");
  });

  it("엑셀이 한글을 깨뜨리지 않게 BOM 을 붙인다", () => {
    expect(toCsv(rows).charCodeAt(0)).toBe(0xfeff);
  });

  it("가맹점 이름의 따옴표를 두 번 써서 가둔다", () => {
    expect(toCsv(rows)).toContain('"국밥""집"""');
  });

  it("장소가 없으면 빈 칸으로 끝난다", () => {
    const last = toCsv(rows).split("\r\n")[2];
    expect(last.endsWith(",")).toBe(true);
  });
});
