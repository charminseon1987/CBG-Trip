"use client";

/* 장소 설명 창 — 일정 카드나 지도 핀을 누르면 뜬다.

   특징 · 사진 · 역사를 한 장에 모아 둔다. 내용은 빌드 때 구워 둔 상세팩에서
   오고(한국어 위키백과), 사진은 public/places/ 에 내려받아 둔 것이라
   네트워크 없이도 뜬다.

   위키백과에 항목이 없는 곳은 사진과 역사가 비어 있다. 그럴 때는 그 칸을
   감추고 특징만 보여 준다 — 아무 데서나 사진을 긁어오는 쪽을 택하지 않았다. */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface PlaceInfo {
  id: string; name: string; zone: string; zoneId: string;
  kind: string | null; lat: number | null; lng: number | null;
  tip: string; stay: number | null; open: string; close: string;
  about: string; history: string; img: string;
  credit: { artist: string; license: string; page: string } | null;
  wiki: string; source: string;
}

const hhmm = (s: string) => (s && s.length === 4 ? `${s.slice(0, 2)}:${s.slice(2)}` : s);

export default function PlaceSheet({
  tripId, placeId, color, inPlan, busy, onClose, onAdd, onRemove, onGuide,
}: {
  tripId: string;
  placeId: string;
  /** 구역 색 — 창의 띠를 지도와 같은 색으로 맞춘다 */
  color: string;
  /** 지금 일정에 들어 있는 곳인가 */
  inPlan: boolean;
  busy: boolean;
  onClose: () => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  /** 일정에 있는 곳이면 "여기로 안내" — 길안내 커서를 이곳으로 옮긴다 */
  onGuide?: (id: string) => void;
}) {
  const [info, setInfo] = useState<PlaceInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setInfo(null);
    setErr(null);
    api<PlaceInfo>(`/api/trips/${tripId}/place?id=${encodeURIComponent(placeId)}`)
      .then((d) => { if (alive) setInfo(d); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "설명을 받지 못했습니다."); });
    return () => { alive = false; };
  }, [tripId, placeId]);

  /* Esc 로 닫는다 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label={info?.name ?? "장소 설명"}
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-[min(34rem,100%)] overflow-y-auto rounded-2xl border border-rule bg-card shadow-2xl"
        style={{ borderTop: `6px solid ${color}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 사진 ── */}
        {info?.img && (
          <figure className="m-0">
            {/* 지역팩과 함께 구워 둔 로컬 파일이라 next/image 최적화가 필요 없다 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={info.img} alt={`${info.name} 사진`}
              className="h-48 w-full object-cover sm:h-56" />
            {info.credit && (info.credit.artist || info.credit.license) && (
              <figcaption className="px-4 pt-1.5 text-[11.5px] text-muted">
                사진 {info.credit.artist || "작자 미상"}
                {info.credit.license ? ` · ${info.credit.license}` : ""} · 위키미디어 공용
              </figcaption>
            )}
          </figure>
        )}

        <div className="p-4">
          {/* ── 이름 ── */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold leading-tight">{info?.name ?? "불러오는 중…"}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {info?.zone && <span className="chip" style={{ color }}>{info.zone}</span>}
                {info?.stay ? (
                  <span className="font-mono text-[12.5px] text-muted">머무는 시간 {info.stay}분</span>
                ) : null}
                {info?.open && info?.close && (
                  <span className="font-mono text-[12.5px] text-muted">
                    {hhmm(info.open)}~{hhmm(info.close)}
                  </span>
                )}
              </div>
            </div>
            <button className="icb flex-none" onClick={onClose} aria-label="닫기">✕</button>
          </div>

          {err && <p className="mt-3 text-sm font-bold text-rose">{err}</p>}

          {/* ── 특징 ── */}
          {info?.tip && (
            <section className="mt-4">
              <h3 className="text-[12.5px] font-bold uppercase tracking-wide text-muted">특징</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink">{info.tip}</p>
            </section>
          )}

          {/* ── 어떤 곳인가 ── */}
          {info?.about && (
            <section className="mt-4">
              <h3 className="text-[12.5px] font-bold uppercase tracking-wide text-muted">어떤 곳인가</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{info.about}</p>
            </section>
          )}

          {/* ── 역사 ── */}
          {info?.history && (
            <section className="mt-4">
              <h3 className="text-[12.5px] font-bold uppercase tracking-wide text-muted">역사</h3>
              <div className="mt-1 flex flex-col gap-2 border-l-2 pl-3 text-sm leading-relaxed text-ink-2"
                style={{ borderColor: color }}>
                {info.history.split("\n").filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </section>
          )}

          {/* 위키백과에 항목이 없는 곳 — 왜 사진·역사가 없는지 밝힌다 */}
          {info && !info.about && !info.history && (
            <p className="mt-4 text-[12.5px] leading-snug text-muted">
              이곳은 위키백과에 항목이 없어 사진과 역사를 넣지 못했습니다. 위의 특징은 운영 정보에서 왔습니다.
            </p>
          )}

          {/* ── 출처 ── */}
          {info && (
            <p className="mt-4 text-[12.5px] text-muted">
              출처 {info.wiki ? (
                <a href={info.wiki} target="_blank" rel="noreferrer noopener"
                  className="underline decoration-dotted">위키백과 · {info.name}</a>
              ) : info.source}
            </p>
          )}

          {/* ── 할 일 ── */}
          <div className="mt-4 flex flex-wrap gap-2">
            {inPlan ? (
              <>
                {onGuide && (
                  <button className="btn btn-primary flex-1" disabled={busy}
                    onClick={() => { onGuide(placeId); onClose(); }}>
                    여기로 안내
                  </button>
                )}
                <button className="btn" disabled={busy} onClick={() => onRemove(placeId)}>
                  일정에서 빼기
                </button>
              </>
            ) : (
              <button className="btn btn-primary flex-1" disabled={busy} onClick={() => onAdd(placeId)}>
                일정에 넣기
              </button>
            )}
            <button className="btn" onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>
    </div>
  );
}
