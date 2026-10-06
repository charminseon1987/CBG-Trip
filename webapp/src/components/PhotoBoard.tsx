"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CatFace from "./CatFace";
import DiaryPage from "./DiaryPage";
import { api } from "@/lib/api";
import { dayLabel } from "@/lib/days";
import { prepare } from "@/lib/photo-file";
import type { Diary, Photo, Trip } from "@/lib/types";

interface DayRow {
  date: string;
  day: number | null;
  photos: number;
  diary: boolean;
}
interface PhotosPayload {
  photos: Photo[];
  days: DayRow[];
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 오늘이 여행 기간 안이면 오늘, 아니면 사진이 있는 마지막 날, 그것도 없으면 첫날 */
function pickDefault(days: DayRow[]): string | null {
  const today = ymd(new Date());
  if (days.some((d) => d.date === today)) return today;
  return [...days].reverse().find((d) => d.photos)?.date ?? days[0]?.date ?? null;
}

export default function PhotoBoard({ trip }: { trip: Trip }) {
  const [days, setDays] = useState<DayRow[]>([]);
  const [all, setAll] = useState<Photo[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [diary, setDiary] = useState<Diary | null>(null);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState<null | "upload" | "diary">(null);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const d = await api<PhotosPayload>(`/api/trips/${trip.id}/photos`);
    setAll(d.photos);
    setDays(d.days);
    setSel((cur) => cur ?? pickDefault(d.days));
  }, [trip.id]);

  useEffect(() => {
    load().catch((e) => setNote(e instanceof Error ? e.message : "사진을 불러오지 못했습니다."));
  }, [load]);

  useEffect(() => {
    if (!sel) return;
    setDiary(null);
    api<{ diary: Diary | null }>(`/api/trips/${trip.id}/diary?date=${sel}`)
      .then((d) => {
        setDiary(d.diary);
        setMemo(d.diary?.memo ?? "");
      })
      .catch(() => setDiary(null));
  }, [sel, trip.id]);

  const photos = useMemo(() => all.filter((p) => p.date === sel), [all, sel]);
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  const selDay = days.find((d) => d.date === sel);

  /* 같은 장소끼리 묶어 시각순으로 */
  const groups = useMemo(() => {
    const out: { place: string; time: string; items: Photo[] }[] = [];
    for (const p of photos) {
      const place = p.place ?? "이동 중";
      const last = out.at(-1);
      if (last && last.place === place) last.items.push(p);
      else out.push({ place, time: p.takenAt, items: [p] });
    }
    return out;
  }, [photos]);

  async function upload(files: FileList | null) {
    if (!files?.length || !sel) return;
    setBusy("upload");
    setNote(null);
    let moved = 0;
    try {
      for (const f of [...files]) {
        const p = await prepare(f);
        const fallback = new Date(f.lastModified);
        // EXIF 날짜가 있으면 그 날짜로, 없으면 지금 보고 있는 날짜에 넣는다
        const date: string = p.date ?? sel;
        if (date !== sel) moved++;
        await api(`/api/trips/${trip.id}/photos`, {
          method: "POST",
          body: JSON.stringify({ url: p.url, date, takenAt: p.takenAt ?? hhmm(fallback) }),
        });
      }
      await load();
      if (moved) setNote(`${moved}장은 찍은 날짜에 맞춰 다른 날로 들어갔습니다.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "사진을 올리지 못했습니다.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function write() {
    if (!sel) return;
    setBusy("diary");
    setNote(null);
    try {
      const d = await api<{ diary: Diary }>(`/api/trips/${trip.id}/diary`, {
        method: "POST",
        body: JSON.stringify({ date: sel, memo }),
      });
      setDiary(d.diary);
      await load();
      if (d.diary.by === "rule") {
        setNote("모델 없이 사진 정보로만 채웠습니다. 모델을 연결하면 문장이 더 살아납니다.");
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "일기를 쓰지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    await api(`/api/trips/${trip.id}/photos/${id}`, { method: "DELETE" });
    await load();
  }

  async function moveTo(id: string, date: string) {
    await api(`/api/trips/${trip.id}/photos/${id}`, { method: "PATCH", body: JSON.stringify({ date }) });
    await load();
  }

  return (
    <div className="h-full overflow-y-auto pb-28">
      {/* 날짜 띠 */}
      <div className="day-strip sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur no-print">
        {days.map((d) => {
          const on = d.date === sel;
          return (
            <button
              key={d.date}
              onClick={() => setSel(d.date)}
              aria-pressed={on}
              className={`flex-none rounded-2xl border-2 px-3 py-1.5 text-left leading-tight transition ${
                on ? "border-brand bg-brand text-white" : "border-rule bg-card hover:border-brand/50"
              }`}
            >
              <span className={`block text-[11px] font-bold ${on ? "text-white/80" : "text-brand"}`}>
                {d.day ? `${d.day}일째` : "여행 밖"}
                {d.diary ? " ✎" : ""}
              </span>
              <span className="block text-sm font-bold">{dayLabel(d.date)}</span>
              <span className={`block text-[11px] ${on ? "text-white/80" : "text-muted"}`}>
                사진 {d.photos}장
              </span>
            </button>
          );
        })}
      </div>

      <div className="mx-auto max-w-3xl px-4 pt-5">
        {note && (
          <p role="status" className="mb-4 rounded-xl border border-rule bg-card px-4 py-2 text-sm text-ink-2">
            {note}
          </p>
        )}

        {/* 일기 */}
        {diary && sel ? (
          <>
            <DiaryPage diary={diary} photos={byId} day={selDay?.day ?? null} />
            <div className="no-print mx-auto mt-4 flex max-w-xl flex-wrap items-center justify-center gap-2">
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="빠진 이야기가 있으면 적고 다시 쓰기"
                className="min-w-0 flex-1 rounded-full border-2 border-rule bg-card px-4 py-2 text-sm outline-none focus:border-brand"
              />
              <button className="btn" onClick={write} disabled={busy !== null}>
                {busy === "diary" ? "쓰는 중…" : "다시 쓰기"}
              </button>
              <button className="btn" onClick={() => window.print()}>인쇄·PDF</button>
            </div>
          </>
        ) : (
          sel && (
            <section className="diary no-print text-center">
              <p className="diary-date">{dayLabel(sel)}</p>
              <h2 className="hand mt-1 text-4xl">오늘의 여행일기</h2>
              {photos.length ? (
                <>
                  <p className="mt-3 text-sm text-ink-2">
                    사진 {photos.length}장, {groups.length}곳으로 한 쪽을 꾸밉니다.
                    날씨나 있었던 일을 적으면 일기에 들어갑니다.
                  </p>
                  <textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="예) 맑고 더움. 둘째가 처음으로 파도에 발 담금"
                    className="hand mt-4 w-full resize-none rounded-xl border-2 border-dashed border-rule bg-white/70 px-4 py-2 text-xl outline-none focus:border-brand"
                  />
                  <button className="btn btn-primary mt-3" onClick={write} disabled={busy !== null}>
                    {busy === "diary" ? "일기 쓰는 중…" : "여행일기 쓰기"}
                  </button>
                </>
              ) : (
                <p className="mt-3 text-sm text-ink-2">이 날 사진을 올리면 일기를 쓸 수 있습니다.</p>
              )}
            </section>
          )
        )}

        {/* 사진 */}
        <section className="no-print mt-10" aria-label="이 날 사진">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">{sel ? `${dayLabel(sel)} 사진` : "사진"}</h3>
            <label className={`btn btn-primary cursor-pointer ${busy || !sel ? "pointer-events-none opacity-50" : ""}`}>
              {busy === "upload" ? "올리는 중…" : "사진 올리기"}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => upload(e.target.files)}
              />
            </label>
          </div>

          {!photos.length ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-rule py-10 text-center">
              <CatFace who="album" size={72} ring="border-brand" />
              <p className="text-sm text-ink-2">
                찍은 날짜를 읽어 그날로 자동 정리합니다.<br />날짜 정보가 없는 사진은 지금 보는 날에 들어갑니다.
              </p>
            </div>
          ) : (
            groups.map((g, gi) => (
              <div key={`${g.time}-${gi}`} className="mb-6">
                <p className="mb-2 text-sm">
                  <b className="text-brand">{g.time}</b> <span className="text-ink-2">{g.place}</span>
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {g.items.map((p) => (
                    <figure key={p.id} className="group relative overflow-hidden rounded-xl bg-card">
                      <img src={p.url} alt={p.caption || `${p.takenAt} 사진`} loading="lazy"
                        className="aspect-square w-full object-cover" />
                      <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1 pt-4 text-[11px] text-white">
                        <span>{p.takenAt}</span>
                        <span className="flex gap-1">
                          {days.length > 1 && (
                            <select
                              aria-label="다른 날로 옮기기"
                              value={p.date}
                              onChange={(e) => moveTo(p.id, e.target.value)}
                              className="max-w-[4.5rem] rounded bg-black/40 text-[10px]"
                            >
                              {days.map((d) => (
                                <option key={d.date} value={d.date}>{d.day ? `${d.day}일째` : d.date.slice(5)}</option>
                              ))}
                            </select>
                          )}
                          <button aria-label="사진 지우기" onClick={() => remove(p.id)}
                            className="rounded bg-black/40 px-1">✕</button>
                        </span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
