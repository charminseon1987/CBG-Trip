"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CatFace from "./CatFace";
import ShowAlertDialog, { useShowAlert } from "./ShowAlert";
import TripMap, { zoneColorMap } from "./TripMap";
import { straightTo, useLiveLocation } from "./useLiveLocation";
import type { Origin } from "@/lib/geo";
import { api } from "@/lib/api";
import type { MapInfo } from "./TripWorkspace";
import type { Trip } from "@/lib/types";

export interface Zone { id: string; name: string; color: string }

export interface RegionDTO {
  key: string; title: string; mode: "walk" | "drive"; speed: number; source: string;
  vw: number; vh: number; zones: Zone[];
  origin: Origin; mPerPx: number;
  base: string;                       // 지도 바탕 SVG — 서버 컴포넌트가 넘겨 준다
}

export interface PlanRowDTO {
  no: number; id: string; name: string; zone: string; zoneId: string;
  kind?: string; lat?: number; lng?: number;
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
             low: number | null; high: number | null; isToday: boolean;
             from: "kma" | "everland"; note?: string } | null;
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
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ from: number; over: number } | null>(null);
  const [day, setDay] = useState<ParkDay | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [byZone, setByZone] = useState(false);

  const region: RegionDTO | null = useMemo(
    () => (plan?.region && map ? { ...plan.region, base: map.base } : null),
    [plan?.region, map],
  );
  const zc = useMemo(() => (region ? zoneColorMap(region) : {}), [region]);

  /* 공연 10분 전 알림 — 시각이 고정이라 놓치면 끝이다 */
  const show = useShowAlert(plan?.rows ?? [], trip.date);

  /* 실시간 내 위치 — 버튼을 눌러야 시작한다 */
  const live = useLiveLocation(
    region?.origin ?? null, region?.vw ?? 0, region?.vh ?? 0, region?.mPerPx ?? 1,
  );

  /* ---------- 끌어서 순서 바꾸기 ----------
     HTML5 드래그는 터치에서 동작하지 않고 자동 테스트도 어렵다.
     포인터 이벤트로 직접 구현해 마우스·펜·터치를 모두 같은 길로 처리한다. */
  const indexAt = (clientY: number): number | null => {
    const box = listRef.current;
    if (!box) return null;
    const cards = [...box.querySelectorAll<HTMLElement>("[data-idx]")];
    for (const el of cards) {
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) return Number(el.dataset.idx);
    }
    // 목록 바깥이면 가장 가까운 끝으로
    if (!cards.length) return null;
    const first = cards[0].getBoundingClientRect();
    const last = cards[cards.length - 1].getBoundingClientRect();
    if (clientY < first.top) return 0;
    if (clientY > last.bottom) return cards.length - 1;
    return null;
  };

  const onDragStart = (i: number) => (e: React.PointerEvent) => {
    if (busy) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const d = { from: i, over: i };
    dragRef.current = d;
    setDrag(d);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const over = indexAt(e.clientY);
    if (over != null && over !== d.over) {
      const nd = { ...d, over };
      dragRef.current = nd;
      setDrag(nd);
    }
  };
  const onDragEnd = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (d && d.from !== d.over) propose({ action: "move", from: d.from, to: d.over });
  };

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
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 pb-28 lg:grid lg:grid-cols-[3.4fr_6.4fr_3.2fr] lg:overflow-hidden lg:pb-3">
      {/* ───────── 오늘의 일정 ───────── */}
      <section className="order-3 shrink-0 lg:order-none lg:min-h-0 lg:shrink lg:overflow-y-auto lg:pr-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">오늘의 일정</h2>
          <button className="btn" disabled={busy} onClick={() => propose({ action: "optimize" })}>
            동선 최적화
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-[12.5px] text-muted">카드를 끌어 옮기면 순서가 바뀝니다. ▲▼ 로도 됩니다.</p>
          <button className="chip" style={{ color: byZone ? "var(--brand)" : "var(--muted)" }}
            onClick={() => setByZone((v) => !v)}>
            {byZone ? "시간순" : "구역별"}
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Fact k="일정" v={`${summary.stops}개`} />
          <Fact k={`${move} 거리`} v={`${summary.total_km} km`} />
          <Fact k={`${move} 시간`} v={`${summary.move_min}분`} />
          <Fact k="끝나는 시각" v={summary.ends_at} />
        </dl>

        {byZone && (
          <div className="mt-3 flex flex-col gap-2">
            {region.zones.map((z) => {
              const list = rows.filter((r) => r.zoneId === z.id);
              if (!list.length) return null;
              const stay = list.reduce((s2, r) => s2 + r.stay, 0);
              return (
                <div key={z.id} className="rounded-xl border border-rule bg-card p-3"
                  style={{ borderLeft: `6px solid ${zc[z.id]}` }}>
                  <div className="flex items-baseline justify-between">
                    <b style={{ color: zc[z.id] }}>{z.name}</b>
                    <span className="font-mono text-[12.5px] text-muted">
                      {list.length}곳 · 머무는 시간 {stay}분 · {list[0].at}~{list[list.length - 1].end}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-2">
                    {list.map((r) => `${r.no}. ${r.name}`).join(" · ")}
                  </p>
                </div>
              );
            })}
            <p className="text-[12.5px] text-muted">
              한 구역을 몰아서 도는지 흩어져 있는지 보려면 이 보기가 편합니다. 순서를 바꾸려면 시간순으로 돌아가세요.
            </p>
          </div>
        )}

        <div ref={listRef} hidden={byZone} className="mt-4 flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={r.id}>
              {r.leg && (
                <p className="py-1 pl-3 font-mono text-[12.5px] text-muted">
                  🐾 {move} {r.leg.m >= 1000 ? `${(r.leg.m / 1000).toFixed(1)} km` : `${r.leg.m} m`}
                </p>
              )}
              <article
                data-idx={i}
                className={`rounded-xl border bg-card p-3 shadow-sm transition ${
                  i === cursor ? "border-brand ring-2 ring-brand/25" : "border-rule"
                } ${drag?.from === i ? "opacity-40" : ""} ${
                  drag && drag.over === i && drag.from !== i ? "ring-2 ring-brand ring-offset-1" : ""
                }`}
                style={{ borderLeft: `6px solid ${zc[r.zoneId] ?? "var(--brand)"}` }}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    data-grip={i}
                    onPointerDown={onDragStart(i)}
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd}
                    className="cursor-grab touch-none select-none px-0.5 text-muted active:cursor-grabbing"
                    title="끌어서 순서 바꾸기"
                    aria-label={`${r.name} 순서 바꾸기`}
                  >⠿</span>
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
                  <span className="font-mono text-[12.5px] text-muted">머무는 시간 {r.stay}분</span>
                </div>
                {r.problem && <p className="mt-1 text-xs font-bold text-brand">{r.problem}</p>}
                {i === cursor && r.note && <p className="mt-2 text-xs text-ink-2">{r.note}</p>}
              </article>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── 지도 ───────── */}
      <section className="order-2 flex h-[58vh] shrink-0 flex-col overflow-hidden rounded-2xl border border-rule bg-card p-2 lg:order-none lg:h-auto lg:min-h-0 lg:shrink">
        {/* 그날의 날짜 · 날씨 · 운영시간 */}
        <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 px-1 pb-2 text-xs">
          <b className="text-sm">
            {day?.date ?? trip.date}
            {day?.weekday ? ` ${day.weekday}` : ""}
          </b>
          {day?.weather && (
            <span className="inline-flex items-center gap-1"
              title={`${day.weather.note ?? ""} (코드 ${day.weather.code})`}>
              <span className="text-base leading-none">{day.weather.icon}</span>
              {day.weather.label && <span>{day.weather.label}</span>}
              <span className="font-mono font-bold">
                {day.weather.isToday && day.weather.temp
                  ? `${day.weather.temp}°C`
                  : day.weather.low != null && day.weather.high != null
                    ? `${day.weather.low}° / ${day.weather.high}°`
                    : "—"}
              </span>
              <span className="text-[12.5px] text-muted">
                {day.weather.from === "kma" ? "기상청" : "에버랜드"}
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
            showZone={zone} me={live.me}
            onPick={(kind, id) =>
              propose(kind === "in" ? { action: "remove", id } : { action: "add", id })
            }
          />

          {/* 지도 오른쪽 아래 — 일정 추가 */}
          <button
            className="btn btn-primary absolute bottom-3 right-3 shadow-lg"
            onClick={() => setAddOpen((v) => !v)}
            aria-expanded={addOpen}
          >
            {addOpen ? "닫기" : `+ 일정 추가 ${candidates.length}`}
          </button>

          {/* 구역별로 묶은 추가 목록 */}
          {addOpen && (
            <div className="absolute bottom-16 right-3 max-h-[60%] w-[min(22rem,80%)] overflow-y-auto
                            rounded-xl border-2 border-brand bg-card p-3 shadow-2xl">
              <p className="mb-2 text-xs text-muted">구역별로 묶었습니다. 누르면 가장 덜 돌아가는 자리에 들어갑니다.</p>
              {region.zones.map((z) => {
                const list = candidates.filter((c) => c.zoneId === z.id);
                if (!list.length) return null;
                return (
                  <div key={z.id} className="mb-2">
                    <p className="mb-1 text-[12.5px] font-bold" style={{ color: zc[z.id] }}>
                      {z.name} {list.length}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {list.map((c) => (
                        <button key={c.id} className="chip" style={{ color: zc[c.zoneId] }}
                          disabled={busy} title={c.note}
                          onClick={() => propose({ action: "add", id: c.id })}>
                          + {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="flex-none px-2 pt-2 text-[12.5px] leading-snug text-muted">
          핀을 누르면 일정에서 빼고, 속이 빈 동그라미를 누르면 넣습니다. {region.source}
        </p>
      </section>

      {/* ───────── 길안내 ───────── */}
      <section className="order-1 shrink-0 lg:order-none lg:min-h-0 lg:shrink lg:overflow-y-auto">
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

            {/* 실시간 안내 */}
            <div className="mt-3 rounded-lg bg-paper p-3">
              {live.state === "on" && live.lat != null && next.lat != null && next.lng != null ? (
                (() => {
                  const d = Math.round(straightTo(region.origin, live.lat!, live.lng!, next.lat!, next.lng!));
                  const near = d <= 35;
                  return (
                    <div>
                      <p className="text-sm">
                        <b style={{ color: near ? "var(--z-zoo)" : "var(--z-global)" }}>
                          {near ? "거의 도착했습니다" : `${d} m 남음`}
                        </b>
                        <span className="ml-2 font-mono text-[12.5px] text-muted">
                          직선거리 · 정확도 ±{Math.round(live.accuracy ?? 0)}m
                        </span>
                      </p>
                      {near && (
                        <button className="btn btn-primary mt-2 w-full"
                          onClick={() => { setCursor(cursor + 1); }}>
                          도착 — 다음 목적지로
                        </button>
                      )}
                    </div>
                  );
                })()
              ) : (
                <p className="text-xs text-ink-2">{live.message ?? "내 위치를 켜면 남은 거리를 실시간으로 알려 줍니다."}</p>
              )}

              <button
                className={`btn mt-2 w-full ${live.state === "off" ? "btn-primary" : ""}`}
                onClick={() => (live.state === "off" ? live.start() : live.stop())}
              >
                {live.state === "off" ? "안내 시작 — 내 위치 켜기"
                  : live.state === "asking" ? "위치 확인 중… (누르면 중지)"
                  : "안내 중지"}
              </button>
            </div>

            <div className="mt-3 flex gap-2">
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

      <ShowAlertDialog
        due={show.due}
        onClose={show.dismiss}
        onGo={async () => {
          const i = rows.findIndex((r) => r.id === show.due?.row.id);
          show.dismiss();
          if (i > 0) await setCursor(i - 1);   /* 그 공연이 "다음 목적지" 가 되게 한 칸 앞에 선다 */
          if (live.state === "off") live.start();
        }}
      />

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
    <dt className="text-[12.5px] uppercase tracking-wide text-muted">{k}</dt>
    <dd className="font-mono text-base font-bold">{v}</dd>
  </div>
);

const Delta = ({ k, v, d, bad }: { k: string; v: string; d: string; bad: boolean }) => (
  <div className="rounded-lg bg-paper px-2 py-1.5">
    <dt className="text-[12.5px] text-muted">{k}</dt>
    <dd className="font-mono text-[12.5px]">{v}</dd>
    <dd className={`font-mono text-sm font-bold ${bad ? "text-rose" : "text-z-zoo"}`}>{d}</dd>
  </div>
);

const Msg = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-2xl px-6 py-10 text-ink-2">{children}</div>
);
