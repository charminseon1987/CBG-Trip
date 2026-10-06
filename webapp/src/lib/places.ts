/* 장소 상세 — 특징 · 역사 · 썸네일 사진.

   scripts/build_detail.py 가 한국어 위키백과에서 한 번 긁어 구운 JSON 을 읽는다.
   런타임에 위키백과를 부르지 않는다: 느리고, 끊기면 화면이 비고, 남의 서버에
   사용자 수만큼 부담을 준다.

   위키백과에 항목이 없는 곳(에버랜드 어트랙션 대부분)은 사진·역사가 없다.
   그런 곳은 지역팩이 쥔 한 줄(tip)만 보여 준다 — 아무 데서나 사진을 긁어오면
   저작권 문제가 되므로 일부러 비워 둔다. */
import everland from "@data/regions/everland.detail.json";
import gyeongju from "@data/regions/gyeongju.detail.json";

export interface PlaceCredit {
  artist: string;
  license: string;
  page: string;
}

export interface PlaceDetail {
  /** 지역팩이 쥔 한 줄 — 늘 있다 */
  tip: string;
  kind?: string | null;
  stay?: number | null;
  open?: string;
  close?: string;
  /** 위키백과 머리글 요약 */
  about?: string;
  /** 위키백과 본문의 '역사' 절 앞부분 */
  history?: string;
  /** /places/<지역>/<id>.jpg — public 에 내려받아 둔 사진 */
  img?: string;
  credit?: PlaceCredit;
  wiki?: string;
  wikiTitle?: string;
}

const DETAILS = { everland, gyeongju } as unknown as Record<string, Record<string, PlaceDetail>>;

/** 그 지역에 상세팩이 있는가 */
export const hasDetails = (region: string | null | undefined): boolean =>
  !!(region && DETAILS[region]);

export function placeDetail(
  region: string | null | undefined,
  id: string,
): PlaceDetail | null {
  if (!region) return null;
  return DETAILS[region]?.[id] ?? null;
}

/** 어느 곳에 사진·역사가 있는지 — 목록에 뱃지를 달 때 쓴다 */
export function detailIndex(region: string | null | undefined): Record<string, { img: boolean; history: boolean }> {
  const pack = (region && DETAILS[region]) || {};
  const out: Record<string, { img: boolean; history: boolean }> = {};
  for (const [id, d] of Object.entries(pack)) {
    out[id] = { img: !!d.img, history: !!d.history };
  }
  return out;
}
