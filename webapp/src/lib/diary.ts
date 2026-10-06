/* ============================================================
   오늘의 여행일기

   나누는 일
     1) 다녀온 곳 정리 — 그날 사진을 시각순으로 놓고 같은 장소끼리 묶는다 (결정적)
     2) 글쓰기       — 모델이 제목·문장·스티커만 쓴다 (prompts/diary.md)
     3) 모델이 없거나 실패하면 규칙으로 채운다 — 일기장이 비는 일은 없다

   장소·시각·장수는 1)이 정하고 모델은 바꾸지 못한다.
   ============================================================ */
import { generateObject, type ImagePart, type TextPart } from "ai";
import { z } from "zod";
import { DIARY } from "@/agents/prompts";
import { hasModel, modelFor, promptSuffix, providerId } from "@/agents/provider";
import { tripDays } from "./days";
import { store } from "./store";
import type { Diary, DiaryStop, Photo, Trip } from "./types";

export const UNKNOWN = "장소 미상";
const MAX_IMAGES = 8;
/** 장소를 모르는 사진은 이만큼 시간이 벌어지면 다른 장면으로 나눈다 (분) */
const SCENE_GAP = 30;

type Scene = Omit<DiaryStop, "line" | "label" | "bubble">;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/* ---------- 1) 다녀온 곳 — 사진첩 시간순 ---------- */
export function stopsOf(photos: Photo[]): Scene[] {
  const sorted = photos.slice().sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const out: (Scene & { lastAt: string })[] = [];
  for (const p of sorted) {
    const place = p.place?.trim() || UNKNOWN;
    const last = out.at(-1);
    const sameScene =
      last && last.place === place &&
      (place !== UNKNOWN || minutes(p.takenAt) - minutes(last.lastAt) <= SCENE_GAP);
    if (last && sameScene) {
      last.photoIds.push(p.id);
      last.lastAt = p.takenAt;
    } else out.push({ time: p.takenAt, place, photoIds: [p.id], lastAt: p.takenAt });
  }
  return out.map(({ lastAt: _drop, ...s }) => s);
}

/* ---------- 2) 모델이 쓰는 부분 ---------- */
const Written = z.object({
  title: z.string().min(1).max(40),
  mood: z.string().min(1).max(8),
  opening: z.string().min(1).max(300),
  lines: z.array(z.object({
    index: z.number().int(),
    text: z.string().max(200),
    label: z.string().max(16).optional(),
    bubble: z.string().max(12).optional(),
  })),
  closing: z.string().max(200),
  stickers: z.array(z.string().max(8)).max(6),
  cover: z.string().nullable(),
});

/** data URI 를 모델에 넘길 이미지 조각으로 */
function imagePart(url: string): ImagePart | null {
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(url);
  if (m) return { type: "image", image: m[2], mediaType: m[1] };
  if (/^https?:\/\//.test(url)) return { type: "image", image: new URL(url) };
  return null;
}

async function writeWithModel(
  trip: Trip, day: number | null, date: string,
  stops: Scene[], photos: Photo[], memo: string,
) {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const brief = {
    여행: { 이름: trip.title, 장소: trip.place, 인원: trip.people, 테마: trip.theme },
    날짜: date,
    며칠째: day,
    오늘의_메모: memo || "(없음)",
    다녀온_곳: stops.map((s, index) => ({
      index,
      시각: s.time,
      장소: s.place,
      사진_장수: s.photoIds.length,
      캡션: s.photoIds.map((id) => byId.get(id)?.caption).filter(Boolean),
      사진_id: s.photoIds,
    })),
  };

  const content: (TextPart | ImagePart)[] = [
    { type: "text", text: `오늘의 기록이다. 여행일기를 써 줘.\n${JSON.stringify(brief, null, 1)}` },
  ];
  // 로컬 모델(qwen3)은 이미지를 못 본다 — Anthropic 일 때만 장면별 첫 사진을 붙인다
  if (providerId() === "anthropic") {
    for (const s of stops.slice(0, MAX_IMAGES)) {
      const p = byId.get(s.photoIds[0]);
      const part = p && imagePart(p.url);
      if (part) content.push({ type: "text", text: `사진 ${p.id} · ${s.time} ${s.place}` }, part);
    }
  }

  const { object } = await generateObject({
    model: modelFor("default"),
    schema: Written,
    system: DIARY() + promptSuffix(),
    messages: [{ role: "user", content }],
  });
  return object;
}

/* ---------- 3) 규칙으로 채우기 ---------- */
const STICKER_HINTS: [RegExp, string][] = [
  [/바다|해변|비치|beach/i, "🌊"], [/공원|정원|숲|가든/, "🌳"], [/동물|사파리|주/, "🦁"],
  [/카페|커피/, "☕"], [/식당|맛집|점심|저녁|밥/, "🍽️"], [/퍼레이드|공연|쇼/, "🎠"],
  [/호텔|숙소|빌라|리조트/, "🛏️"], [/사원|절|궁|성/, "⛩️"], [/공항|비행/, "✈️"],
];

function writeByRule(
  trip: Trip, day: number | null, stops: Scene[], photos: Photo[], memo: string,
) {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const named = stops.filter((s) => s.place !== UNKNOWN);
  const first = stops[0];
  const last = stops.at(-1)!;
  const stickers = [
    ...new Set(stops.flatMap((s) => STICKER_HINTS.filter(([re]) => re.test(s.place)).map(([, e]) => e))),
  ];
  return {
    title: day ? `${trip.title} ${day}일째` : `${trip.title}의 하루`,
    mood: "😊",
    opening:
      `${first.time}에 첫 사진을 찍고 ${last.time}까지 ` +
      (named.length ? `${named.length}곳을 다녔다.` : "하루를 보냈다.") +
      (memo ? ` ${memo}` : ""),
    lines: stops.map((s, index) => {
      const caps = s.photoIds.map((id) => byId.get(id)?.caption).filter(Boolean) as string[];
      const where = s.place === UNKNOWN ? `${s.time} 무렵` : s.place;
      return {
        index,
        text: caps.length ? caps.join(" ") : `${where}에 사진 ${s.photoIds.length}장을 남겼다.`,
        label: where,
        bubble: "",
      };
    }),
    closing: `오늘 남긴 사진은 모두 ${photos.length}장.`,
    stickers: [...stickers, "📸", "💌"].slice(0, 5),
    cover: (first.photoIds[0] ?? null) as string | null,
  };
}

/* ---------- 합치기 ---------- */
export async function makeDiary(tripId: string, date: string, memo = ""): Promise<Diary | { error: string }> {
  const trip = await store.getTrip(tripId);
  if (!trip) return { error: "여행을 찾지 못했습니다." };
  const all = await store.listPhotos(tripId);
  const photos = all.filter((p) => p.date === date);
  if (!photos.length) return { error: "이 날짜에 올린 사진이 없습니다. 사진을 먼저 올려 주세요." };

  const day = tripDays(trip, [date]).find((d) => d.date === date)?.day ?? null;
  const stops = stopsOf(photos);

  let by: Diary["by"] = "rule";
  let w: z.infer<typeof Written> = writeByRule(trip, day, stops, photos, memo);
  if (hasModel()) {
    try {
      w = await writeWithModel(trip, day, date, stops, photos, memo);
      by = "model";
    } catch (e) {
      console.warn("[diary] 모델이 쓰지 못해 규칙으로 채웁니다:", e instanceof Error ? e.message : e);
    }
  }

  // 모델이 빠뜨린 줄은 규칙 문장으로 메운다
  const fallback = writeByRule(trip, day, stops, photos, memo).lines;
  const lineAt = (i: number) => w.lines.find((l) => l.index === i);
  const lineOf = (i: number) => lineAt(i)?.text?.trim() || fallback[i].text;
  // 이름표: 일정 블록 이름이 있으면 그것을 쓴다. 모르면 모델이 사진에서 본 장면 이름, 그것도 없으면 시각.
  const labelOf = (i: number) =>
    stops[i].place !== UNKNOWN ? stops[i].place : lineAt(i)?.label?.trim() || fallback[i].label || stops[i].time;
  const ids = new Set(photos.map((p) => p.id));

  const diary: Diary = {
    tripId, date,
    title: w.title.trim(),
    mood: w.mood.trim() || "😊",
    opening: w.opening.trim(),
    stops: stops.map((s, i) => ({
      ...s, line: lineOf(i), label: labelOf(i), bubble: lineAt(i)?.bubble?.trim() ?? "",
    })),
    closing: w.closing.trim(),
    stickers: w.stickers.filter(Boolean).slice(0, 5),
    cover: w.cover && ids.has(w.cover) ? w.cover : photos[0].id,
    memo,
    by,
    madeAt: new Date().toISOString(),
  };
  return store.putDiary(diary);
}
