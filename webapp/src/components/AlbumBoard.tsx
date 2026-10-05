"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CatFace from "./CatFace";
import { api } from "@/lib/api";
import type { Trip } from "@/lib/types";

interface Photo {
  id: string; url: string; takenAt: string; caption: string; place: string | null;
}

/* 사진에서 찍은 시각을 읽는다.
   1순위 EXIF DateTimeOriginal — 폰 사진은 거의 다 들고 있다
   2순위 파일의 수정 시각 — 카톡으로 받은 사진처럼 EXIF 가 지워진 경우 */
async function takenTime(file: File): Promise<{ date: string; time: string; from: "exif" | "file" }> {
  const head = new DataView(await file.slice(0, 128 * 1024).arrayBuffer());
  const exif = readExifDate(head);
  if (exif) return { ...exif, from: "exif" };
  const d = new Date(file.lastModified);
  return { date: ymd(d), time: hm(d), from: "file" };
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** JPEG APP1(Exif) 안의 DateTimeOriginal(0x9003) 을 찾는다. 외부 라이브러리 없이. */
function readExifDate(v: DataView): { date: string; time: string } | null {
  try {
    if (v.getUint16(0) !== 0xffd8) return null;              // JPEG 아님
    let off = 2;
    while (off < v.byteLength - 4) {
      if (v.getUint8(off) !== 0xff) return null;
      const marker = v.getUint8(off + 1);
      const size = v.getUint16(off + 2);
      if (marker === 0xe1) {                                  // APP1
        const base = off + 10;                                // "Exif\0\0" 다음
        const le = v.getUint16(base) === 0x4949;              // 바이트 순서
        const u16 = (p: number) => v.getUint16(p, le);
        const u32 = (p: number) => v.getUint32(p, le);
        const walk = (dir: number): string | null => {
          const n = u16(dir);
          for (let i = 0; i < n; i++) {
            const e = dir + 2 + i * 12;
            const tag = u16(e);
            if (tag === 0x8769) {                             // Exif IFD 포인터
              const sub = walk(base + u32(e + 8));
              if (sub) return sub;
            }
            if (tag === 0x9003 || tag === 0x9004) {           // DateTimeOriginal / DateTimeDigitized
              const p = base + u32(e + 8);
              let s = "";
              for (let k = 0; k < 19; k++) s += String.fromCharCode(v.getUint8(p + k));
              return s;                                       // "2026:10:03 13:05:21"
            }
          }
          return null;
        };
        const raw = walk(base + u32(base + 4));
        if (!raw) return null;
        const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/);
        if (!m) return null;
        return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
      }
      off += 2 + size;
    }
  } catch { /* EXIF 가 깨졌으면 조용히 포기하고 파일 시각을 쓴다 */ }
  return null;
}

/** 올리기 전에 줄인다 — 원본 그대로면 한 장에 수 MB 라 금방 터진다 */
async function shrink(file: File, max = 1280, quality = 0.82): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return c.toDataURL("image/jpeg", quality);
}

export default function AlbumBoard({ trip }: { trip: Trip }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ name: string; why: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const d = await api<{ photos: Photo[] }>(`/api/trips/${trip.id}/photos`);
    setPhotos(d.photos);
  }, [trip.id]);

  useEffect(() => { void load(); }, [load]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    const miss: { name: string; why: string }[] = [];
    let done = 0;

    for (const f of files) {
      setBusy(`${++done} / ${files.length}`);
      try {
        const t = await takenTime(f);
        if (t.date !== trip.date) {
          miss.push({ name: f.name, why: `${t.date} 사진 — 이 여행(${trip.date})이 아닙니다` });
          continue;
        }
        const url = await shrink(f);
        await api(`/api/trips/${trip.id}/photos`, {
          method: "POST",
          body: JSON.stringify({ url, takenAt: t.time, caption: "" }),
        });
      } catch (err) {
        miss.push({ name: f.name, why: err instanceof Error ? err.message : "읽지 못했습니다" });
      }
    }
    setBusy(null);
    setSkipped(miss);
    await load();
  }

  async function caption(p: Photo, text: string) {
    setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, caption: text } : x)));
    await api(`/api/trips/${trip.id}/photos/${p.id}`, {
      method: "PATCH", body: JSON.stringify({ caption: text }),
    }).catch(() => {});
  }

  async function remove(p: Photo) {
    await api(`/api/trips/${trip.id}/photos/${p.id}`, { method: "DELETE" });
    await load();
  }

  /* 일정 블록으로 묶는다 — 서버가 사진마다 그 시각의 장소를 붙여 준다 */
  const groups = photos.reduce<Record<string, Photo[]>>((acc, p) => {
    const k = p.place ?? "일정 밖";
    (acc[k] ||= []).push(p);
    return acc;
  }, {});
  const order = Object.keys(groups).sort(
    (a, b) => (groups[a][0]?.takenAt ?? "").localeCompare(groups[b][0]?.takenAt ?? ""),
  );

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-5 py-6 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">앨범 · 사진</h2>
          <p className="text-sm text-ink-2">
            {trip.date} 에 찍은 사진만 담고, 찍힌 시각으로 일정 블록에 자동 분류합니다.
          </p>
        </div>
        <button className="btn btn-primary" disabled={!!busy} onClick={() => inputRef.current?.click()}>
          {busy ? `올리는 중 ${busy}` : "폰 사진 가져오기"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={pick} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact k="사진" v={`${photos.length}장`} />
        <Fact k="메모" v={`${photos.filter((p) => p.caption).length}장`} />
        <Fact k="블록" v={`${order.length}개`} />
        <Fact k="첫 컷" v={photos[0]?.takenAt ?? "—"} />
      </dl>

      {skipped.length > 0 && (
        <div className="mt-4 rounded-xl border border-rule bg-card p-3 text-sm">
          <b>담지 않은 사진 {skipped.length}장</b>
          <ul className="mt-1 flex flex-col gap-0.5 text-ink-2">
            {skipped.slice(0, 6).map((s, i) => (
              <li key={i} className="truncate">· {s.name} — {s.why}</li>
            ))}
          </ul>
          <button className="btn mt-2" onClick={() => setSkipped([])}>닫기</button>
        </div>
      )}

      {photos.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <CatFace who="album" size={120} ring="border-brand" className="border-[3px]" />
          <p className="text-ink-2">
            아직 사진이 없습니다.<br />
            <b>폰 사진 가져오기</b>를 누르면 갤러리가 열리고, 그날 찍은 것만 골라 담습니다.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {order.map((place) => (
            <section key={place}>
              <h3 className="mb-2 text-sm font-bold text-brand">
                {place} <span className="font-mono text-xs text-muted">{groups[place].length}장</span>
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {groups[place]
                  .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
                  .map((p) => (
                    <figure key={p.id} className="overflow-hidden rounded-xl border border-rule bg-card">
                      {/* 사용자가 올린 data URI 라 next/image 를 쓰지 않는다 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.caption || `${p.takenAt} 사진`}
                        className="aspect-[4/3] w-full object-cover" />
                      <figcaption className="p-2">
                        <span className="font-mono text-xs text-muted">{p.takenAt}</span>
                        <input
                          defaultValue={p.caption}
                          placeholder="메모"
                          onBlur={(e) => caption(p, e.target.value)}
                          className="mt-1 w-full rounded border border-rule bg-paper px-2 py-1 text-xs"
                        />
                        <button className="btn-ghost mt-1 text-xs text-muted" onClick={() => remove(p)}>
                          삭제
                        </button>
                      </figcaption>
                    </figure>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-xl bg-card px-3 py-2 shadow-sm">
    <dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt>
    <dd className="font-mono text-base font-bold">{v}</dd>
  </div>
);
