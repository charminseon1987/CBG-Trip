/* 날짜 계산 — 사진 탭의 날짜 띠와 일기가 같이 쓴다.
   시간대 때문에 하루가 밀리지 않도록 전부 UTC 자정 기준으로 센다. */
import type { Trip } from "./types";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

const toUTC = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromUTC = (t: number) => new Date(t).toISOString().slice(0, 10);

/** from 부터 to 까지 모든 날짜 (최대 31일) */
export function eachDate(from: string, to: string): string[] {
  if (!DATE_RE.test(from)) return [];
  const end = DATE_RE.test(to) && to >= from ? toUTC(to) : toUTC(from);
  const out: string[] = [];
  for (let t = toUTC(from); t <= end && out.length < 31; t += 86_400_000) out.push(fromUTC(t));
  return out;
}

export interface DayTab {
  date: string;
  day: number | null;   // 여행 며칠째 — 여행 기간 밖이면 null
}

/** 여행 기간의 날짜 + 기간 밖에 찍힌 사진 날짜 */
export function tripDays(trip: Pick<Trip, "date" | "end">, photoDates: string[]): DayTab[] {
  const span = eachDate(trip.date, trip.end);
  const all = [...new Set([...span, ...photoDates.filter((d) => DATE_RE.test(d))])].sort();
  return all.map((date) => {
    const i = span.indexOf(date);
    return { date, day: i >= 0 ? i + 1 : null };
  });
}

/** "10월 9일 (금)" */
export function dayLabel(date: string): string {
  const t = new Date(toUTC(date));
  return `${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일 (${WEEK[t.getUTCDay()]})`;
}

/** 일기 머리에 쓰는 "2026. 10. 9. 금요일" */
export function diaryDate(date: string): string {
  const t = new Date(toUTC(date));
  return `${t.getUTCFullYear()}. ${t.getUTCMonth() + 1}. ${t.getUTCDate()}. ${WEEK[t.getUTCDay()]}요일`;
}
