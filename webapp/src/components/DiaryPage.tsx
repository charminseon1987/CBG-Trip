"use client";

/* ============================================================
   여행일기 한 쪽 — 가로 스크랩북, 장면을 ㄹ자 점선으로 잇는다.

   - 장면 순서는 사진첩 시간순 (lib/diary.ts 의 stopsOf)
   - 한 줄에 놓는 장면 수는 폭으로 정한다: 넓으면 3, 중간 2, 폰 1
   - 홀수 줄은 오른쪽→왼쪽으로 뒤집어 놓아 길이 ㄹ자로 꺾인다
   - 점선은 그려진 번호 배지 위치를 재서 SVG 로 잇는다 (사진이 로드되면 다시 잰다)
   ============================================================ */
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { diaryDate } from "@/lib/days";
import type { Diary, DiaryStop, Photo } from "@/lib/types";

const TAPES = ["sb-t-y", "sb-t-p", "sb-t-m", "sb-t-b"];
const LABELS = ["#FFE08A", "#BDEBDD", "#F8C6D6", "#C9DDFB"];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const tilt = (id: string, span = 4) => `${((hash(id) % (span * 20)) / 10 - span).toFixed(1)}deg`;

/** "14:05" → "오후 2시 5분" */
function spoken(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}시${m ? ` ${m}분` : ""}`;
}

const perRowFor = (w: number) => (w >= 1080 ? 3 : w >= 660 ? 2 : 1);

export default function DiaryPage({
  diary, photos, day,
}: {
  diary: Diary;
  photos: Map<string, Photo>;
  day: number | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [per, setPer] = useState(1);
  const perRef = useRef(1);
  const [route, setRoute] = useState<{ d: string; w: number; h: number } | null>(null);

  /* 폭이 바뀌면 한 줄 장면 수와 점선을 다시 잡는다 */
  const measure = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const n = perRowFor(box.width);
    perRef.current = n;
    setPer(n);
    const marks = [...el.querySelectorAll<HTMLElement>("[data-station]")]
      .map((m) => {
        const r = m.getBoundingClientRect();
        return {
          i: Number(m.dataset.station),
          row: Number(m.dataset.row),
          x: r.left + r.width / 2 - box.left,
          y: r.top + r.height / 2 - box.top,
        };
      })
      .sort((a, b) => a.i - b.i);
    if (marks.length < 2) return setRoute(null);
    const edge = 14;
    let d = `M ${marks[0].x} ${marks[0].y}`;
    for (let k = 1; k < marks.length; k++) {
      const a = marks[k - 1], b = marks[k];
      if (a.row === b.row) d += ` H ${b.x}`;
      else {
        // 짝수 줄은 오른쪽 끝에서, 홀수 줄은 왼쪽 끝에서 꺾는다 — ㄹ
        // 폰(한 줄에 하나)에서는 왼쪽 가장자리를 따라 내려간다
        const side = perRef.current === 1 || a.row % 2 === 1 ? edge : box.width - edge;
        d += ` H ${side} V ${b.y} H ${b.x}`;
      }
    }
    setRoute({ d, w: box.width, h: box.height });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [measure, diary, per]);

  /* 장면 + 마지막 입장권을 한 줄씩 끊는다 */
  const items: ({ kind: "stop"; stop: DiaryStop; i: number } | { kind: "end"; i: number })[] = [
    ...diary.stops.map((stop, i) => ({ kind: "stop" as const, stop, i })),
    { kind: "end" as const, i: diary.stops.length },
  ];
  const rows: (typeof items)[] = [];
  for (let k = 0; k < items.length; k += per) rows.push(items.slice(k, k + per));

  const cover = diary.cover ? photos.get(diary.cover) : undefined;

  return (
    <article className="sb-page diary-enter" aria-label={`${diary.date} 여행일기`}>
      {/* 머리 — 제목 · 날짜 도장 · 첫 줄 메모 · 표지 */}
      <header className="sb-head">
        <div className="sb-head-title">
          <p className="hand sb-kicker">우리들의 여행일기{day ? ` · ${day}일째` : ""}</p>
          <h2 className="sb-title">{diary.title}</h2>
          <svg viewBox="0 0 300 16" className="sb-squiggle" preserveAspectRatio="none" aria-hidden>
            <path d="M2 9 q12 -9 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0" />
          </svg>
          <div className="sb-stamp" aria-label={diaryDate(diary.date)}>
            <span>{diary.mood}</span>
            <b>{diary.date.slice(5).replace("-", ".")}</b>
            <span>{diary.date.slice(0, 4)}</span>
          </div>
        </div>
        <div className="sb-memo hand"><span className="sb-pin" />{diary.opening}</div>
        {cover && (
          <figure className="sb-photo sb-pol sb-cover" style={{ ["--tilt" as string]: "-2deg" }}>
            <span className="sb-tape sb-t-y" style={{ top: -10, left: -14, transform: "rotate(-35deg)" }} />
            <span className="sb-tape sb-t-y" style={{ top: -10, right: -14, transform: "rotate(35deg)" }} />
            <img src={cover.url} alt={cover.caption || "오늘의 한 장"} onLoad={measure} />
            <figcaption>오늘의 한 장</figcaption>
          </figure>
        )}
      </header>

      {/* 장면들 — ㄹ자 */}
      <div ref={wrap} className="sb-trail">
        {route && (
          <svg className="sb-route" width={route.w} height={route.h} aria-hidden>
            <path d={route.d} className="sb-route-casing" />
            <path d={route.d} className="sb-route-line" />
          </svg>
        )}
        {rows.map((row, r) => (
          <div key={r} className="sb-row" style={{ flexDirection: per > 1 && r % 2 ? "row-reverse" : "row" }}>
            {row.map((it) =>
              it.kind === "stop" ? (
                <Scene key={it.i} stop={it.stop} i={it.i} row={r} photos={photos} onLoad={measure} />
              ) : (
                <div key="end" className="sb-cell sb-end">
                  <span className="sb-dot" data-station={it.i} data-row={r} aria-hidden />
                  <div className="sb-ticket">
                    <div className="sb-ticket-a">
                      <small>ADMIT ONE</small>
                      <p className="hand">{diary.closing}</p>
                    </div>
                    <div className="sb-ticket-b">{diary.date.replaceAll("-", ".")}</div>
                  </div>
                  <div className="sb-stickers">
                    {diary.stickers.map((e, k) => (
                      <span key={k} className="sb-stk" style={{ ["--tilt" as string]: tilt(`${e}${k}`, 12) }}>{e}</span>
                    ))}
                  </div>
                </div>
              ),
            )}
            {/* 마지막 줄 빈칸 — 줄 높이와 간격을 다른 줄과 맞춘다 */}
            {Array.from({ length: per - row.length }, (_, k) => <div key={`pad${k}`} className="sb-cell" aria-hidden />)}
          </div>
        ))}
      </div>
      {diary.memo && diary.by === "model" && <p className="hand sb-foot">메모: {diary.memo}</p>}
    </article>
  );
}

function Scene({
  stop, i, row, photos, onLoad,
}: {
  stop: DiaryStop; i: number; row: number; photos: Map<string, Photo>; onLoad: () => void;
}) {
  const shots = stop.photoIds.map((id) => photos.get(id)).filter(Boolean) as Photo[];
  const more = shots.length - 3;
  const tape = TAPES[i % TAPES.length];

  return (
    <section className="sb-cell" aria-label={`${spoken(stop.time)} ${stop.label}`}>
      <div className="sb-cell-head">
        <span className="sb-badge" data-station={i} data-row={row}>{i + 1}</span>
        <span className="sb-label" style={{ background: LABELS[i % LABELS.length] }}>{stop.label}</span>
        <span className="sb-time">{spoken(stop.time)}</span>
      </div>
      {stop.bubble && <span className="sb-bubble">{stop.bubble}</span>}

      {shots.length === 1 && (
        <figure className="sb-photo sb-one" style={{ ["--tilt" as string]: tilt(shots[0].id, 3) }}>
          <span className={`sb-tape ${tape}`} style={{ top: -10, left: "38%" }} />
          <img src={shots[0].url} alt={shots[0].caption || stop.label} onLoad={onLoad} loading="lazy" />
        </figure>
      )}
      {shots.length === 2 && (
        <div className="sb-two">
          {shots.map((p, k) => (
            <figure key={p.id} className="sb-photo" style={{ ["--tilt" as string]: k ? "4deg" : "-5deg", marginTop: k ? 18 : 0 }}>
              <span className={`sb-tape ${TAPES[(i + k) % TAPES.length]}`} style={{ top: -10, left: "28%" }} />
              <img src={p.url} alt={p.caption || stop.label} onLoad={onLoad} loading="lazy" />
            </figure>
          ))}
        </div>
      )}
      {shots.length >= 3 && (
        <div className="sb-film">
          {shots.slice(0, 3).map((p) => (
            <img key={p.id} src={p.url} alt={p.caption || stop.label} onLoad={onLoad} loading="lazy" />
          ))}
          {more > 0 && <span className="sb-more">+{more}</span>}
        </div>
      )}
      <p className="hand sb-line">{stop.line}</p>
    </section>
  );
}
