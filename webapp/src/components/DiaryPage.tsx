"use client";

import { diaryDate } from "@/lib/days";
import type { Diary, Photo } from "@/lib/types";

/* 모눈 일기장 한 쪽. 기울기·테이프 색은 사진 id 로 정해 매번 같은 모양으로 그린다. */
const TAPES = ["#F7B7CF", "#BFE3F7", "#CDEBB5", "#FCE3A6", "#D9CCF7"];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const tilt = (id: string, span = 4) => `${((hash(id) % (span * 20)) / 10 - span).toFixed(1)}deg`;
const tape = (id: string) => TAPES[hash(id) % TAPES.length];

/** "14:05" → "오후 2시 5분" */
function spoken(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ap = h < 12 ? "오전" : "오후";
  const hh = h % 12 || 12;
  return `${ap} ${hh}시${m ? ` ${m}분` : ""}`;
}

export default function DiaryPage({
  diary, photos, day,
}: {
  diary: Diary;
  photos: Map<string, Photo>;
  day: number | null;
}) {
  const cover = diary.cover ? photos.get(diary.cover) : undefined;

  return (
    <article className="diary diary-enter" aria-label={`${diary.date} 여행일기`}>
      {/* 머리 */}
      <header className="relative pr-24">
        <p className="diary-date">
          {diaryDate(diary.date)}
          {day ? ` · ${day}일째` : ""}
        </p>
        <h2 className="diary-title">{diary.title}</h2>
        <span className="sticker absolute right-0 top-0 text-[2.6rem]" style={{ ["--tilt" as string]: "10deg" }}
          aria-label="오늘 기분">{diary.mood}</span>
      </header>

      {/* 표지 사진 + 여는 글 */}
      <div className="mt-5 grid gap-5 sm:grid-cols-[11rem_1fr] sm:items-start">
        {cover && (
          <figure className="polaroid mx-auto w-44 sm:w-full" style={{ ["--tilt" as string]: "-3deg" }}>
            <span className="tape -top-3 left-1/2 -translate-x-1/2" style={{ ["--tape" as string]: tape(cover.id) }} />
            <img src={cover.url} alt={cover.caption || `${cover.takenAt} 사진`} />
            <figcaption>{cover.place ?? "오늘의 한 장"}</figcaption>
          </figure>
        )}
        <p className="diary-text">{diary.opening}</p>
      </div>

      {/* 다녀온 곳 */}
      <section className="route" aria-label="오늘 다녀온 곳">
        {diary.stops.map((s, i) => {
          const shots = s.photoIds.map((id) => photos.get(id)).filter(Boolean).slice(0, 3) as Photo[];
          return (
            <div key={`${s.time}-${i}`} className="route-stop">
              <div className="route-time">{spoken(s.time)}</div>
              <div className="route-place">{s.place}</div>
              <p className="diary-text mt-1">{s.line}</p>
              {shots.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {shots.map((p) => (
                    <figure key={p.id} className="polaroid w-24 !pb-2"
                      style={{ ["--tilt" as string]: tilt(p.id) }}>
                      <img src={p.url} alt={p.caption || `${p.takenAt} ${s.place}`} loading="lazy" />
                    </figure>
                  ))}
                  {s.photoIds.length > 3 && (
                    <span className="hand self-end text-xl text-muted">+{s.photoIds.length - 3}장</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* 닫는 글 + 스티커 */}
      <footer className="relative">
        <p className="diary-text">{diary.closing}</p>
        <div className="mt-4 flex flex-wrap gap-3" aria-label="스티커">
          {diary.stickers.map((e, i) => (
            <span key={i} className="sticker" style={{ ["--tilt" as string]: tilt(`${e}${i}`, 14) }}>{e}</span>
          ))}
        </div>
        {diary.memo && diary.by === "model" && (
          <p className="hand mt-4 text-lg text-muted">메모: {diary.memo}</p>
        )}
      </footer>
    </article>
  );
}
