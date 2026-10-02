/* 지역팩 — 빌드 타임에 구운 JSON을 그대로 읽는다. 런타임 네트워크 호출 없음.
   새 지역을 더하려면 scripts/build_region.py 를 돌려 data/regions/<key>.json 을 만들고
   아래 PACKS 에 한 줄 더하면 된다. */
import everland from "@data/regions/everland.json";
import gyeongju from "@data/regions/gyeongju.json";
import type { RegionPack } from "./types";

const PACKS = { everland, gyeongju } as unknown as Record<string, RegionPack>;

/** 장소 이름에서 지역팩을 고른다 */
const HINTS: Record<string, string[]> = {
  gyeongju: ["경주", "gyeongju", "불국사", "석굴암", "황리단길", "보문"],
  everland: ["에버랜드", "everland", "용인"],
};

export const regionKeys = (): string[] => Object.keys(PACKS);

export const getRegion = (key: string | null | undefined): RegionPack | null =>
  (key && PACKS[key]) || null;

export function guessRegion(...text: (string | null | undefined)[]): string | null {
  const hay = text.filter(Boolean).join(" ").toLowerCase();
  for (const [key, words] of Object.entries(HINTS)) {
    if (words.some((w) => hay.includes(w.toLowerCase()))) return key;
  }
  return null;
}

/** 지도·노드 같은 무거운 필드를 뺀 요약 — 목록 응답에 쓴다 */
export function regionSummary(p: RegionPack) {
  return {
    key: p.key,
    title: p.title,
    mode: p.mode,
    speed: p.speed,
    stops: p.pool.length,
    zones: p.zones,
    defaultPlan: p.plan.map((x) => x.id),
    source: p.source,
  };
}
