/* ============================================================
   카드 명세서 가져오기

   카드사가 자동으로 쏴 주는 API 는 쓸 수 없다 — 실시간 거래내역 조회는
   마이데이터(본인신용정보관리업) 허가나 오픈뱅킹 참가기관 등록이 필요하고,
   둘 다 개인에게는 발급되지 않는다. 카드번호를 받아 긁어오는 방식은
   금융 자격증명을 쥐는 구조라 만들지 않는다.

   그래서 현실적인 길은 하나다 — 카드사 앱/홈페이지에서 내려받은
   이용대금명세서(CSV)나 결제 알림 문자를 그대로 넣는 것.
   이 파일은 그 텍스트를 지출 행으로 바꾼다.
   ============================================================ */

import type { ExpenseCategory } from "./types";

export interface Parsed {
  at: string;              // "13:40"
  date: string | null;     // "2026-10-03" — 파일에 있으면
  amount: number;
  merchant: string;
  category: ExpenseCategory;
  guessed: boolean;        // 분류를 추측했는가 (사용자가 고쳐야 할 수도)
}

/* 가맹점 이름으로 분류를 짐작한다. 확실하지 않으면 etc 로 두고 guessed 를 세운다. */
const RULES: [RegExp, ExpenseCategory][] = [
  [/주차|주유|충전|톨게이트|하이패스|통행료|한국도로공사|SK에너지|GS칼텍스|오일뱅크|렌터카/i, "car"],
  [/에버랜드|롯데월드|입장|매표|티켓|예매|이용권|자유이용/i, "ticket"],
  [/편의점|CU|GS25|세븐일레븐|이마트24|미니스톱|카페|커피|스타벅스|투썸|이디야|빽다방|베이커리|빵/i, "snack"],
  [/식당|한식|중식|일식|분식|고기|갈비|국밥|칼국수|피자|버거|치킨|맥도날드|롯데리아|김밥|쌈밥|포차|레스토랑|푸드|식품관/i, "food"],
  [/기념품|선물|문구|굿즈|기프트|아트샵|souvenir/i, "gift"],
];

export function guessCategory(merchant: string): { category: ExpenseCategory; guessed: boolean } {
  for (const [re, cat] of RULES) if (re.test(merchant)) return { category: cat, guessed: false };
  return { category: "etc", guessed: true };
}

const num = (s: string) => Number(String(s).replace(/[^0-9.-]/g, "")) || 0;
const pad = (n: number) => String(n).padStart(2, "0");

function normDate(s: string): string | null {
  const m = s.match(/(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  return m ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null;
}
function normTime(s: string): string | null {
  const m = s.match(/(\d{1,2})[:시](\d{2})/);
  return m ? `${pad(+m[1])}:${m[2]}` : null;
}

/** 한 줄을 쉼표/탭으로 가른다. 따옴표로 감싼 값 안의 쉼표는 지킨다. */
function splitRow(line: string): string[] {
  if (line.includes("\t") && !line.includes('"')) return line.split("\t");
  const out: string[] = [];
  let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim().replace(/^"|"$/g, ""));
}

/**
 * 카드사마다 열 이름과 순서가 다르다. 머리글을 보고 찾되,
 * 못 찾으면 값의 생김새(날짜꼴·금액꼴)로 추측한다.
 */
export function parseCardCsv(text: string): { rows: Parsed[]; skipped: number; note: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], skipped: 0, note: "내용이 비어 있습니다." };

  const head = splitRow(lines[0]);
  const looksHeader = head.some((h) => /일자|날짜|이용일|승인일|가맹점|금액|시간/.test(h));
  const idx = (re: RegExp) => head.findIndex((h) => re.test(h));
  const col = looksHeader
    ? {
        date: idx(/이용일|승인일|거래일|일자|날짜/),
        time: idx(/시간|시각|이용시간|승인시간/),
        merchant: idx(/가맹점|이용하신곳|상호|내용|적요/),
        amount: idx(/금액|이용금액|승인금액|결제금액/),
      }
    : { date: -1, time: -1, merchant: -1, amount: -1 };

  const body = looksHeader ? lines.slice(1) : lines;
  const rows: Parsed[] = [];
  let skipped = 0;

  for (const line of body) {
    const c = splitRow(line);
    if (c.length < 2) { skipped++; continue; }

    // 열을 못 찾았으면 생김새로 고른다
    const dateCell = col.date >= 0 ? c[col.date] : c.find((x) => normDate(x)) ?? "";
    const timeCell = col.time >= 0 ? c[col.time] : c.find((x) => normTime(x) && !normDate(x)) ?? dateCell;
    const amountCell = col.amount >= 0 ? c[col.amount]
      : [...c].reverse().find((x) => /^[\d,.\s원-]+$/.test(x) && num(x) !== 0) ?? "";
    const merchantCell = col.merchant >= 0 ? c[col.merchant]
      : c.find((x) => /[가-힣A-Za-z]{2,}/.test(x) && !normDate(x) && num(x) === 0) ?? "";

    const amount = Math.abs(num(amountCell));
    if (!amount) { skipped++; continue; }

    const merchant = merchantCell || "미상";
    const { category, guessed } = guessCategory(merchant);
    rows.push({
      at: normTime(timeCell) ?? "12:00",
      date: normDate(dateCell),
      amount,
      merchant,
      category,
      guessed,
    });
  }

  return {
    rows,
    skipped,
    note: looksHeader ? "머리글에서 열을 찾았습니다." : "머리글이 없어 값 모양으로 열을 추측했습니다.",
  };
}

/**
 * 결제 알림 문자 붙여넣기.
 *   "[Web발신] KB국민카드 승인 홍*동 13,500원 일시불 10/03 13:42 황리단길포차"
 */
export function parseCardSms(text: string): { rows: Parsed[]; skipped: number; note: string } {
  const rows: Parsed[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const amt = line.match(/([\d,]{3,})\s*원/);
    if (!amt) { skipped++; continue; }
    const t = line.match(/(\d{1,2})[:시](\d{2})/);
    const d = line.match(/(\d{1,2})[/.월]\s*(\d{1,2})/);
    // 금액·시각·날짜를 걷어낸 나머지에서 가맹점을 고른다
    const merchant =
      line.replace(/\[.*?\]/g, "")
          .replace(/[\d,]{3,}\s*원/g, "")
          .replace(/\d{1,2}[:시]\d{2}/g, "")
          .replace(/\d{1,2}[/.월]\s*\d{1,2}일?/g, "")
          .replace(/승인|취소|일시불|할부|누적|잔액|체크|신용|카드/g, "")
          .replace(/[A-Za-z가-힣]\*+[A-Za-z가-힣]?/g, "")
          .trim().split(/\s+/).filter(Boolean).pop() ?? "미상";
    const { category, guessed } = guessCategory(merchant);
    rows.push({
      at: t ? `${pad(+t[1])}:${t[2]}` : "12:00",
      date: d ? `${new Date().getFullYear()}-${pad(+d[1])}-${pad(+d[2])}` : null,
      amount: num(amt[1]),
      merchant,
      category,
      guessed,
    });
  }
  return { rows, skipped, note: "문자에서 금액·시각·가맹점을 읽었습니다." };
}

/** 엑셀에서 바로 열리도록 BOM 을 붙인 CSV */
export function toCsv(rows: { at: string; category: string; merchant: string; amount: number; place: string | null }[]) {
  const head = "시각,분류,가맹점,금액,장소";
  const body = rows.map((r) =>
    [r.at, r.category, `"${r.merchant.replace(/"/g, '""')}"`, r.amount, r.place ?? ""].join(","),
  );
  return "﻿" + [head, ...body].join("\r\n");
}
