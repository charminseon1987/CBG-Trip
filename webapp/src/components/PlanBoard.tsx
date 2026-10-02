"use client";

import { useEffect, useMemo, useState } from "react";
import CatFace from "./CatFace";
import TripMap, { zoneColorMap } from "./TripMap";
import { api } from "@/lib/api";
import type { MapInfo } from "./TripWorkspace";
import type { Trip } from "@/lib/types";

export interface Zone { id: string; name: string; color: string }

export interface RegionDTO {
  key: string; title: string; mode: "walk" | "drive"; speed: number; source: string;
  vw: number; vh: number; zones: Zone[];
  base: string;                       // 지도 바탕 SVG — 서버 컴포넌트가 넘겨 준다
}

export interface PlanRowDTO {
  no: number; id: string; name: string; zone: string; zoneId: string;
  x: number; y: number; at: string; end: string; stay: number;
  note: string; problem: string | null;
  leg: { m: number; pts: [number, number][] } | null;
  steps: { m: number; turn: string }[];
}

export interface Candidate {
  id: string; name: string; zone: string; zoneId: string;
  kind: string; x: number; y: number; rank: number; note: string;
}

export interface PlanPayload {
  mapped: boolean;
  region?: Omit<RegionDTO, "base">;
  itinerary?: { items: string[]; start: string; busy: boolean; cursor: number };
  summary?: { stops: number; total_km: number; move_min: number; ends_at: string };
  rows?: PlanRowDTO[];
  candidates?: Candidate[];
}

export interface ParkDay {
  date: string; weekday: string;
  weather: { code: string; label: string | null; icon: string; temp: string;
             low: number | null; high: number | null; isToday: boolean } | null;
  hours: { open: string; close: string } | null;
  seasonGrade: string | null;
  error?: string;
}

interface Preview {
  label: string; proposal: string[]; unchanged: boolean;
  before: { stops: number; km: number; ends_at: string };
  after: { stops: number; km: number; ends_at: string };
  delta: { m: number; moveMin: number; endMin: number; stayMin: number };
  why: string | null;
  newProblems: string[];
  verdict: "good" | "same" | "bad";
}

const TURN: Record<string, string> = {
  left: "왼쪽", right: "오른쪽", "sharp-left": "크게 왼쪽", "sharp-right": "크게 오른쪽",
};
const signed = (v: number, unit: string) =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(Math.round(v))}${unit}`;

export default function PlanBoard({
  trip, map, plan, error, onChanged,
}: {
  trip: Trip;
  map: MapInfo | null;
  plan: PlanPayload | null;
  error: string | null;
  onChanged: () => void;
}) {
  const [sheet, setSheet] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [day, setDay] = useState<ParkDay | null>(null);

  const region: RegionDTO | null = useMemo(
    () => (plan?.region && map ? { ...plan.region, base: map.base } : null),
    [plan?.region, map],
  );
  const zc = useMemo(() => (region ? zoneColorMap(region) : {}), [region]);

  /* 그날의 날씨·운영시간 — 공식 API 를 서버가 대신 불러 준다 */
  useEffect(() => {
    let alive = true;
    api<ParkDay>(`/api/trips/${trip.id}/parkday`)
      .then((d) => { if (alive) setDay(d); })
      .catch(() => { if (alive) setDay(null); });
    return () => { alive = false; };
  }, [trip.id]);

  /* 토스트는 잠깐만 띄운다 */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  if (error) return <Msg>{error}</Msg>;
  if (!plan) return <Msg>불러오는 중…</Msg>;
  if (!plan.mapped || !region || !plan.rows || !plan.summary || !plan.itinerary) {
    return (
      <Msg>
        <div className="flex items-center gap-4">
          <CatFace who="designer" size={72} ring="border-brand" />
          <p>
            <b>{trip.place || trip.title}</b>는 아직 지도 데이터가 없습니다. 설계 에이전트가 하루
            시간표를 짭니다 — 아래 냥이 버튼을 눌러 &ldquo;일정 짜줘&rdquo;라고 해 보세요.
          </p>
        </div>
      </Msg>
    );
  }

  const { rows, summary, candidates = [], itinerary } = plan;
  const move = region.mode === "drive" ? "이동" : "도보";
  const cursor = Math.min(itinerary.cursor, rows.length - 1);
  const next = rows[cursor + 1];

  /* ---------- 서버에 먼저 물어보고(preview) → 손해면 확인 창 → 확정(PUT) ---------- */
  async function propose(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const p = await api<Preview>(`/api/trips/${trip.id}/plan/preview`, {
        method: "POST", body: JSON.stringify(body),
      });
      if (p.unchanged) { setSheet(null); return; }
      if (p.verdict === "bad") { setSheet(p); return; }   // 손해면 사용자가 고른다
      await commit(p.proposal);                           // 이득이거나 비슷하면 바로 적용
      setToast(
        `${p.label} — ${p.delta.m === 0 ? "더 걷지 않습니다" : `${signed(p.delta.m, " m")}`}` +
        `${p.delta.endMin !== 0 ? ` · 종료 ${signed(p.delta.endMin, "분")}` : " · 끝나는 시각 그대로"}` +
        `${p.why ? ` (${p.why})` : ""}`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function commit(items: string[]) {
    setBusy(true);
    try {
      await api(`/api/trips/${trip.id}/itinerary`, {
        method: "PUT", body: JSON.stringify({ items }),
      });
      setSheet(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const setCursor = async (n: number) => {
    const c = Math.max(0, Math.min(rows.length - 1, n));
    await api(`/api/trips/${trip.id}/itinerary`, { method: "PUT", body: JSON.stringify({ cursor: c }) });
    onChanged();
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[3.2fr_6fr_3.2fr]">
      {/* ───────── 오늘의 일정 ───────── */}
      <section className="min-h-0 overflow-y-auto pr-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">오늘의 일정</h2>
          <button className="btn" disabled={busy} onClick={() => propose({ action: "optimize" })}>
            동선 최적화
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted">카드를 끌어 옮기면 순서가 바뀝니다. ▲▼ 로도 됩니다.</p>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Fact k="일정" v={`${summary.stops}개`} />
          <Fact k={`${move} 거리`} v={`${summary.total_km} km`} />
          <Fact k={`${move} 시간`} v={`${summary.move_min}분`} />
          <Fact k="끝나는 시각" v={summary.ends_at} />
        </dl>

        <div className="mt-4 flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={r.id}>
              {r.leg && (
                <p className="py-1 pl-3 font-mono text-[11px] text-muted">
                  🐾 {move} {r.leg.m >= 1000 ? `${(r.leg.m / 1000).toFixed(1)} km` : `${r.leg.m} m`}
                </p>
              )}
              <article
                draggable={!busy}
                onDragStart={(e) => {
                  setDrag({ from: i, over: i });
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(i));   // Firefox 는 이게 있어야 끌린다
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (drag && drag.over !== i) setDrag({ ...drag, over: i });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = drag?.from ?? Number(e.dataTransfer.getData("text/plain"));
                  setDrag(null);
                  if (Number.isFinite(from) && from !== i) propose({ action: "move", from, to: i });
                }}
                onDragEnd={() => setDrag(null)}
                className={`cursor-grab rounded-xl border bg-card p-3 shadow-sm transition active:cursor-grabbing ${
                  i === cursor ? "border-brand ring-2 ring-brand/25" : "border-rule"
                } ${drag?.from === i ? "opacity-40" : ""} ${
                  drag && drag.over === i && drag.from !== i ? "ring-2 ring-brand ring-offset-1" : ""
                }`}
                style={{ borderLeft: `6px solid ${zc[r.zoneId] ?? "var(--brand)"}` }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="select-none text-muted" title="끌어서 순서 바꾸기">⠿</span>
                  <span className="font-mono text-sm font-bold">{r.at}</span>
                  <b className="flex-1 truncate">{r.name}</b>
                  <span className="flex gap-0.5">
                    <button className="icb" title="위로" disabled={busy || i === 0}
                      onClick={() => propose({ action: "move", from: i, to: i - 1 })}>▲</button>
                    <button className="icb" title="아래로" disabled={busy || i === rows.length - 1}
                      onClick={() => propose({ action: "move", from: i, to: i + 1 })}>▼</button>
                    <button className="icb" title="빼기" disabled={busy}
                      onClick={() => propose({ action: "remove", id: r.id })}>✕</button>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="chip" style={{ color: zc[r.zoneId] ?? "var(--muted)" }}>{r.zone}</span>
                  <span className="font-mono text-[11px] text-muted">머무는 시간 {r.stay}분</span>
                </div>
                {r.problem && <p className="mt-1 text-xs font-bold text-brand">{r.problem}</p>}
                {i === cursor && r.note && <p className="mt-2 text-xs text-ink-2">{r.note}</p>}
              </article>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── 지도 ───────── */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-rule bg-card p-2">
        {/* 그날의 날짜 · 날씨 · 운영시간 */}
        <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 px-1 pb-2 text-xs">
          <b className="text-sm">
            {day?.date ?? trip.date}
            {day?.weekday ? ` ${day.weekday}` : ""}
          </b>
          {day?.weather && (
            <span className="inline-flex items-center gap-1" title={`날씨 코드 ${day.weather.code}`}>
              <span className="text-base leading-none">{day.weather.icon}</span>
              {day.weather.label && <span>{day.weather.label}</span>}
              <span className="font-mono font-bold">
                {day.weather.isToday
                  ? `${day.weather.temp}°C`
                  : `${day.weather.low}° / ${day.weather.high}°`}
              </span>
            </span>
          )}
          {day?.hours && (
            <span className="font-mono text-muted">
              운영 {day.hours.open}~{day.hours.close}
            </span>
          )}
          {day?.seasonGrade && (
            <span className="chip" style={{ color: "var(--z-amer)" }}>시즌 {day.seasonGrade}</span>
          )}
          {day?.error && <span className="text-muted">날씨 정보를 받지 못했습니다</span>}
        </div>

        <div className="flex flex-none flex-wrap items-center gap-1.5 px-1 pb-2">
          <button className={`chip ${zone === null ? "chip-solid" : ""}`}
            style={zone === null ? { background: "var(--ink)" } : { color: "var(--muted)" }}
            onClick={() => setZone(null)}>전체</button>
          {region.zones.map((z) => (
            <button key={z.id}
              className={`chip ${zone === z.id ? "chip-solid" : ""}`}
              style={zone === z.id ? { background: zc[z.id] } : { color: zc[z.id] }}
              onClick={() => setZone(zone === z.id ? null : z.id)}>
              {z.name}
            </button>
          ))}
        </div>

        <div className="relative min-h-0 flex-1">
          <TripMap
            region={region} rows={rows} candidates={candidates} cursor={cursor}
            showZone={zone}
            onPick={(kind, id) =>
              propose(kind === "in" ? { action: "remove", id } : { action: "add", id })
            }
          />
        </div>

        <p className="flex-none px-2 pt-2 text-[11px] leading-snug text-muted">
          핀을 누르면 일정에서 빼고, 속이 빈 동그라미를 누르면 넣습니다. {region.source}
        </p>
      </section>

      {/* ───────── 길안내 ───────── */}
      <section className="min-h-0 overflow-y-auto">
        <h2 className="text-lg font-bold">길안내</h2>
        <p className="font-mono text-xs text-muted">{cursor + 1} / {rows.length}</p>

        {next ? (
          <div className="mt-3 rounded-2xl border border-rule bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 flex-none place-content-center rounded-full text-xl text-white"
                style={{ background: zc[next.zoneId] ?? "var(--brand)" }}>→</span>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{next.name}</p>
                <p className="font-mono text-xs text-muted">
                  {next.leg ? `${next.leg.m} m · ` : ""}
                  {move} {next.leg ? Math.ceil(next.leg.m / region.speed) : 0}분 · {next.at} 도착
                </p>
              </div>
            </div>

            {next.steps.length > 0 && (
              <ol className="mt-3 flex flex-col gap-1 border-l-2 border-rule pl-3 text-sm text-muted">
                {next.steps.map((s, k) => (
                  <li key={k} className={k === 0 ? "font-bold text-ink" : ""}>
                    <span className="font-mono">{s.m} m</span>{" "}
                    {s.turn === "arrive" ? "직진 후 도착" : `직진 후 ${TURN[s.turn]}으로`}
                  </li>
                ))}
              </ol>
            )}
            {next.note && <p className="mt-3 rounded-lg bg-paper p-3 text-sm text-ink-2">{next.note}</p>}

            <div className="mt-4 flex gap-2">
              <button className="btn btn-primary flex-1" disabled={busy} onClick={() => setCursor(cursor + 1)}>
                여기 도착 · 다음으로
              </button>
              <button className="btn" disabled={busy || cursor === 0} onClick={() => setCursor(cursor - 1)}>
                이전
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-rule bg-card p-4 text-sm">
            <p className="font-bold">오늘 일정이 끝났습니다.</p>
            <p className="mt-1 text-muted">
              총 {summary.total_km} km · {move} {summary.move_min}분 · {summary.ends_at} 종료
            </p>
            <button className="btn mt-3" onClick={() => setCursor(0)}>처음으로</button>
          </div>
        )}

        {candidates.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-bold">
              일정에 없는 곳 {zone ? candidates.filter((c) => c.zoneId === zone).length : candidates.length}
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {candidates
                .filter((c) => !zone || c.zoneId === zone)
                .map((c) => (
                  <button key={c.id} className="chip" style={{ color: zc[c.zoneId] ?? "var(--muted)" }}
                    disabled={busy} title={c.note}
                    onClick={() => propose({ action: "add", id: c.id })}>
                    + {c.name}
                  </button>
                ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              누르면 가장 덜 돌아가는 자리에 넣고, 거리가 많이 늘면 먼저 물어봅니다.
            </p>
          </div>
        )}
      </section>

      {toast && (
        <div className="sheet sheet-good text-sm" role="status">{toast}</div>
      )}

      {/* ───────── 확인 창 ───────── */}
      {sheet && (
        <div className={`sheet ${sheet.verdict === "bad" ? "sheet-bad" : "sheet-good"}`}>
          <p className="text-sm font-bold">{sheet.label} — 이대로 할까요?</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            <Delta k={`${move} 거리`} v={`${sheet.before.km} → ${sheet.after.km} km`}
              d={signed(sheet.delta.m, " m")} bad={sheet.delta.m > 0} />
            <Delta k={`${move} 시간`} v={sheet.delta.moveMin >= 0 ? "늘어남" : "줄어듦"}
              d={signed(sheet.delta.moveMin, "분")} bad={sheet.delta.moveMin > 0} />
            <Delta k="끝나는 시각" v={`${sheet.before.ends_at} → ${sheet.after.ends_at}`}
              d={signed(sheet.delta.endMin, "분")} bad={sheet.delta.endMin > 0} />
          </dl>
          {(sheet.delta.stayMin !== 0 || sheet.why) && (
            <p className="mt-2 text-xs text-ink-2">
              {sheet.delta.stayMin !== 0 && <>머무는 시간 {signed(sheet.delta.stayMin, "분")}. </>}
              {sheet.why}
            </p>
          )}
          {sheet.newProblems.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-xs font-bold text-rose">
              {sheet.newProblems.map((p, i) => <li key={i}>⚠ {p}</li>)}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary flex-1" disabled={busy} onClick={() => commit(sheet.proposal)}>
              이대로 진행
            </button>
            <button className="btn" onClick={() => setSheet(null)}>그만두기</button>
          </div>
        </div>
      )}
    </div>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-xl bg-card px-3 py-2 shadow-sm">
    <dt className="text-[10px] uppercase tracking-wide text-muted">{k}</dt>
    <dd className="font-mono text-base font-bold">{v}</dd>
  </div>
);

const Delta = ({ k, v, d, bad }: { k: string; v: string; d: string; bad: boolean }) => (
  <div className="rounded-lg bg-paper px-2 py-1.5">
    <dt className="text-[10px] text-muted">{k}</dt>
    <dd className="font-mono text-[11px]">{v}</dd>
    <dd className={`font-mono text-sm font-bold ${bad ? "text-rose" : "text-z-zoo"}`}>{d}</dd>
  </div>
);

const Msg = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-2xl px-6 py-10 text-ink-2">{children}</div>
);
