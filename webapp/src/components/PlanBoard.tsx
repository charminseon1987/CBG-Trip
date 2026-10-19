"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CatFace from "./CatFace";
import PlaceSheet from "./PlaceSheet";
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

/** 날짜 띠 한 칸 */
export interface DayTabDTO {
  date: string;
  /** 여행 며칟째. 기간 밖이면 null */
  day: number | null;
  label: string;
  stops: number;
}

/** 내 개인 레이어 — 공동 일정 위에 얹는 차이 */
export interface MyLayer {
  dropped: string[];
  added: string[];
  start: string | null;
}

export interface PlanPayload {
  mapped: boolean;
  /** 내 레이어 (손댄 게 없으면 빈 배열들) */
  myLayer?: MyLayer;
  /** 내가 손댄 날짜들 — 날짜 띠에 표시한다 */
  myDates?: string[];
  /** 내 레이어를 얹어 계산한 내 일정. 손댄 게 없으면 null */
  mine?: {
    items: string[];
    start: string;
    summary: { stops: number; total_km: number; move_min: number; ends_at: string };
    rows: PlanRowDTO[];
  } | null;
  /** 여행의 모든 날. 하루 여행이면 한 칸 */
  days?: DayTabDTO[];
  /** 지금 보고 있는 날 */
  date?: string;
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
  trip, map, plan, error, onChanged, onPickDate,
}: {
  trip: Trip;
  map: MapInfo | null;
  plan: PlanPayload | null;
  error: string | null;
  onChanged: () => void;
  /** 날짜 띠에서 다른 날을 골랐을 때 */
  onPickDate: (date: string) => void;
}) {
  const router = useRouter();
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
  /* 공동 일정을 보고 있나, 내 일정을 보고 있나.
     내 레이어가 생기면 자동으로 내 일정 쪽으로 넘어간다 — 내가 바꾼 것이
     화면에 안 보이면 바꾼 줄 모른다 */
  const [showMine, setShowMine] = useState(false);
  /* 기간 고치기를 열었는가. 며칠짜리로 바꾸면 날짜 띠가 그만큼 늘어난다 */
  const [spanOpen, setSpanOpen] = useState(false);
  /* 어느 장소의 설명을 열었는가 — 일정 카드나 지도 픜을 누르면 찜다 */
  const [placeId, setPlaceId] = useState<string | null>(null);

  /* 내 일정이 처음 생기면 그쪽으로 넘긴다 (한 번만) */
  useEffect(() => {
    if (plan?.mine) setShowMine(true);
  }, [plan?.mine ? 1 : 0]);

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

  /* 일정이 없어도 틀은 세운다.
     예전에는 화면 전체가 안내문 한 줄로 바뀌어서, 이 여행에 무엇이 들어갈
     자리인지가 보이지 않았다. 세 칸을 그대로 두고 칸마다 빈 상태를 적는다. */
  if (error) return <EmptyFrame trip={trip} day={day} note={error} tone="bad" />;
  if (!plan) return <EmptyFrame trip={trip} day={day} note="불러오는 중…" />;
  if (!plan.mapped || !region || !plan.rows || !plan.summary || !plan.itinerary) {
    return <EmptyFrame trip={trip} day={day} />;
  }

  const { candidates = [], itinerary } = plan;
  /* 내 일정을 보고 있으면 그 계산을 쓴다. 지도·길안내·현재 위치가 전부
     이 rows 를 보므로, 한 군데서 갈아 끼우면 화면 전체가 내 일정이 된다 */
  const mineOn = showMine && !!plan.mine;
  const rows = mineOn ? plan.mine!.rows : plan.rows!;
  const summary = mineOn ? plan.mine!.summary : plan.summary!;
  const layer: MyLayer = plan.myLayer ?? { dropped: [], added: [], start: null };
  if (rows.length === 0) {
    return <EmptyFrame trip={trip} day={day} mapped />;
  }
  const move = region.mode === "drive" ? "이동" : "도보";
  const cursor = Math.min(itinerary.cursor, rows.length - 1);
  const next = rows[cursor + 1];

  /* ---------- 서버에 먼저 물어보고(preview) → 손해면 확인 창 → 확정(PUT) ---------- */
  async function propose(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const p = await api<Preview>(`/api/trips/${trip.id}/plan/preview`, {
        /* 어느 날을 고치는지 같이 보낸다 — 안 보내면 늘 첫날이 바뀐다 */
        method: "POST", body: JSON.stringify({ date: plan?.date, ...body }),
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
        method: "PUT", body: JSON.stringify({ date: plan?.date, items }),
      });
      setSheet(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  /** 여행 기간을 고친다. 줄여도 그 날 일정·사진·지출은 지우지 않는다 —
      날짜가 기간 밖으로 밀리고 띠에 "기간 밖" 으로 남는다 */
  async function saveSpan(date: string, end: string) {
    setBusy(true);
    try {
      await api(`/api/trips/${trip.id}`, {
        method: "PATCH", body: JSON.stringify({ date, end: end < date ? date : end }),
      });
      setSpanOpen(false);
      onChanged();
      /* 머리글의 날짜는 서버가 그린 것이라 새로 받아야 바뀐다 */
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "기간을 바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  /** 내 레이어를 저장한다. 공동 일정은 건드리지 않는다 —
      보기만 하는 사람도 여기는 쓸 수 있다 */
  async function saveLayer(patch: Partial<MyLayer>) {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/api/trips/${trip.id}/personal`, {
        method: "PUT",
        body: JSON.stringify({ date: plan?.date, ...patch }),
      });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  /** 난 이 곳 안 감 / 다시 감 */
  const toggleDrop = (id: string) => {
    const has = layer.dropped.includes(id);
    void saveLayer({
      dropped: has ? layer.dropped.filter((x) => x !== id) : [...layer.dropped, id],
      added: layer.added.filter((x) => x !== id),
    });
  };

  /** 공동 일정에 없는 곳을 나만 넣는다 */
  const toggleAdd = (id: string) => {
    const has = layer.added.includes(id);
    void saveLayer({
      added: has ? layer.added.filter((x) => x !== id) : [...layer.added, id],
    });
  };

  const setCursor = async (n: number) => {
    const c = Math.max(0, Math.min(rows.length - 1, n));
    await api(`/api/trips/${trip.id}/itinerary`, {
      method: "PUT", body: JSON.stringify({ date: plan?.date, cursor: c }),
    });
    onChanged();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 pb-28 lg:grid lg:grid-cols-[3.4fr_6.4fr_3.2fr] lg:overflow-hidden lg:pb-3">
      {/* ───────── 오늘의 일정 ───────── */}
      <section className="order-3 shrink-0 lg:order-none lg:min-h-0 lg:shrink lg:overflow-y-auto lg:pr-1">
        {/* 기간 — 하루 여행도 여기서 며칠로 늘린다 */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            className="chip text-[12px]"
            onClick={() => setSpanOpen((v) => !v)}
            aria-expanded={spanOpen}
          >
            {trip.date}
            {trip.end && trip.end !== trip.date ? ` ~ ${trip.end}` : ""}
            <b className="ml-1 text-brand">
              {(plan?.days?.filter((d) => d.day).length ?? 1)}일
            </b>
          </button>
          {spanOpen && (
            <span className="flex flex-wrap items-center gap-1 text-[12px]">
              <input id="span-from" type="date" defaultValue={trip.date}
                className="rounded border border-rule bg-paper px-1 py-0.5 font-mono text-xs" />
              <span className="text-muted">~</span>
              <input id="span-to" type="date" defaultValue={trip.end || trip.date}
                className="rounded border border-rule bg-paper px-1 py-0.5 font-mono text-xs" />
              <button
                className="btn btn-primary px-2 py-1 text-xs"
                disabled={busy}
                onClick={() => {
                  const a = (document.getElementById("span-from") as HTMLInputElement)?.value;
                  const b = (document.getElementById("span-to") as HTMLInputElement)?.value;
                  if (a) void saveSpan(a, b || a);
                }}
              >
                저장
              </button>
            </span>
          )}
        </div>

        {/* 공동 일정 ↔ 내 일정. 내가 손댄 것이 있을 때만 고를 수 있다 */}
        {plan?.mine && (
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <button
              onClick={() => setShowMine(false)}
              aria-selected={!mineOn}
              className={`rounded-full px-3 py-1 text-[12.5px] transition ${
                !mineOn ? "bg-brand font-bold text-white" : "text-muted hover:bg-paper"
              }`}
            >
              공동 일정 <span className="opacity-70">{plan.summary?.stops}곳</span>
            </button>
            <button
              onClick={() => setShowMine(true)}
              aria-selected={mineOn}
              className={`rounded-full px-3 py-1 text-[12.5px] transition ${
                mineOn ? "bg-brand font-bold text-white" : "text-muted hover:bg-paper"
              }`}
            >
              내 일정 <span className="opacity-70">{plan.mine.summary.stops}곳</span>
            </button>
            {mineOn && (
              <span className="text-[11px] text-muted">
                {layer.dropped.length ? `${layer.dropped.length}곳 빼고 ` : ""}
                {layer.added.length ? `${layer.added.length}곳 더하고 ` : ""}
                {layer.start ? `${layer.start} 출발` : ""}
              </span>
            )}
          </div>
        )}

        {/* 날짜 띠 — 1박2일 이상이면 날마다 따로 짠다. 하루 여행이면 숨긴다 */}
        {(plan?.days?.length ?? 0) > 1 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {plan!.days!.map((d) => {
              const on = d.date === plan!.date;
              return (
                <button
                  key={d.date}
                  onClick={() => onPickDate(d.date)}
                  aria-selected={on}
                  title={d.day ? `${d.label} · ${d.stops}곳` : `${d.label} · 여행 기간 밖`}
                  className={`rounded-full px-3 py-1 text-[12.5px] transition ${
                    on ? "bg-brand font-bold text-white" : "text-muted hover:bg-paper"
                  } ${d.day ? "" : "italic"}`}
                >
                  {d.day ? `${d.day}일차` : "기간 밖"}
                  <span className={`ml-1 ${on ? "opacity-80" : "opacity-60"}`}>
                    {d.stops ? `${d.stops}곳` : "비어 있음"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">
            {(plan?.days?.length ?? 0) > 1
              ? plan!.days!.find((d) => d.date === plan!.date)?.label ?? "하루 일정"
              : "오늘의 일정"}
          </h2>
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

        {mineOn && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-brand-soft px-3 py-2">
            <span className="text-[12.5px] font-bold text-brand">내 출발</span>
            <input
              type="time"
              defaultValue={layer.start ?? plan.itinerary?.start ?? "09:00"}
              onBlur={(e) => e.target.value && saveLayer({ start: e.target.value })}
              aria-label="내 출발 시각"
              className="rounded border border-rule bg-card px-1 py-0.5 font-mono text-xs"
            />
            {layer.start && (
              <button className="btn btn-ghost px-2 py-0.5 text-xs" disabled={busy}
                onClick={() => void saveLayer({ start: null })}>
                공동 시각으로
              </button>
            )}
            <button className="btn btn-ghost px-2 py-0.5 text-xs" disabled={busy}
              onClick={() => void saveLayer({ dropped: [], added: [], start: null })}>
              내 수정 전부 지우기
            </button>
          </div>
        )}

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
                  {/* 이름을 누르면 그곳의 특징·사진·역사가 뜬다 */}
                  <button
                    className="flex-1 truncate text-left font-bold underline decoration-rule
                               decoration-dotted underline-offset-4 hover:decoration-brand"
                    title={`${r.name} 설명 보기`}
                    onClick={() => setPlaceId(r.id)}
                  >{r.name}</button>
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
                  {/* 공동 일정은 그대로 두고 나만 빠진다. ✕(빼기)는 모두의 일정에서
                      빼는 것이고 이건 내 하루에서만 빠지는 것이다 */}
                  <button className="chip text-[11px]" disabled={busy}
                    title={layer.added.includes(r.id)
                      ? "내가 더한 곳 — 눌러서 내 일정에서 뺀다"
                      : "나는 안 감 — 모두의 일정은 그대로"}
                    onClick={() => (layer.added.includes(r.id) ? toggleAdd(r.id) : toggleDrop(r.id))}>
                    {layer.added.includes(r.id) ? "나만 더함 ✓" : "난 안 감"}
                  </button>
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
        <DayStrip trip={trip} day={day} />

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
            /* 예전엔 한 번 누르면 그자리에서 빼거나 넣었다.
               지우는 일을 한 번의 클릭에 걸어 듐 수 는 없으니,
               누르면 설명을 열고 넣기·바기는 그 안에서 골라도 리다. */
            onPick={(_kind, id) => setPlaceId(id)}
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
          핀이나 동그라미를 누르면 그곳의 특징·사진·역사가 뜨고, 거기서 일정에 넣거나 뺄 수 있습니다. {region.source}
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

        {/* 내가 뺀 곳 — 되돌릴 자리 */}
        {mineOn && layer.dropped.length > 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-rule bg-card/40 p-3">
            <p className="text-sm font-bold text-muted">내가 뺀 곳 {layer.dropped.length}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {layer.dropped.map((id) => {
                const name = plan.rows?.find((x) => x.id === id)?.name
                  ?? candidates.find((c) => c.id === id)?.name ?? id;
                return (
                  <button key={id} className="chip text-[12px]" disabled={busy}
                    title="다시 가기" onClick={() => toggleDrop(id)}>
                    {name} ↩
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">
              모두의 일정에는 그대로 있습니다. 내 일정에서만 빠져 있습니다.
            </p>
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
                  <span key={c.id} className="inline-flex items-center gap-0.5">
                    <button className="chip" style={{ color: zc[c.zoneId] ?? "var(--muted)" }}
                      disabled={busy} title={c.note ?? "모두의 일정에 넣기"}
                      onClick={() => propose({ action: "add", id: c.id })}>
                      + {c.name}
                    </button>
                    {/* 공동 일정은 안 건드리고 나만 간다. 보기만 하는 사람도 이건 된다 */}
                    <button className="chip text-[11px]"
                      disabled={busy}
                      title={layer.added.includes(c.id) ? "내 일정에서 빼기" : "나만 가기 — 모두의 일정은 그대로"}
                      onClick={() => toggleAdd(c.id)}>
                      {layer.added.includes(c.id) ? "나만 ✓" : "나만"}
                    </button>
                  </span>
                ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              <b>+ 이름</b>은 모두의 일정에 넣습니다 — 가장 덜 돌아가는 자리에 넣고, 거리가
              많이 늘면 먼저 물어봅니다. <b>나만</b>은 공동 일정을 그대로 두고 내 일정에만
              더합니다.
            </p>
          </div>
        )}
      </section>

      {/* ───────── 장소 설명 — 특징 · 사진 · 역사 ───────── */}
      {placeId && (
        <PlaceSheet
          tripId={trip.id}
          placeId={placeId}
          color={
            zc[(rows.find((r) => r.id === placeId) ?? candidates.find((c) => c.id === placeId))?.zoneId ?? ""] ??
            "var(--brand)"
          }
          inPlan={rows.some((r) => r.id === placeId)}
          busy={busy}
          onClose={() => setPlaceId(null)}
          onAdd={(id) => { setPlaceId(null); propose({ action: "add", id }); }}
          onRemove={(id) => { setPlaceId(null); propose({ action: "remove", id }); }}
          onGuide={(id) => {
            /* 그곳이 "다음 목적지" 가 되게 한 칸 앞에 선다 */
            const i = rows.findIndex((r) => r.id === id);
            if (i > 0) setCursor(i - 1);
          }}
        />
      )}

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

/* 날짜 · 날씨 · 운영시간 한 줄 — 일정이 있든 없든 같은 자리에 선다 */
function DayStrip({ trip, day }: { trip: Trip; day: ParkDay | null }) {
  return (
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
  );
}

/* 일정이 아직 없는 여행의 화면.
   본 화면과 같은 세 칸 틀을 세우고, 칸마다 무엇이 들어올 자리인지 적는다.
   (지도가 없는 지역이면 가운데 칸에 설계 에이전트를 부르는 안내가 선다) */

/* 설계 에이전트가 짠 하루 시간표.

   지역팩이 없는 여행에는 지도도 거리 계산도 없다. 그런 여행의 일정은 이게
   전부다. 전에는 에이전트가 짜서 저장해도 화면에 나올 길이 없었다 —
   도구 설명만 "저장하면 화면에 바로 나타난다" 고 말하고 있었다. */
interface DraftItem { time: string; name: string; kind: string; minutes?: number; note?: string }
interface DraftDTO { items: DraftItem[]; tips: string[]; madeAt: string }

const KIND: Record<string, string> = {
  move: "이동", food: "먹기", see: "보기", play: "놀기",
  rest: "쉬기", photo: "사진", stay: "묶기",
};

function DraftTable({ trip }: { trip: Trip }) {
  const [draft, setDraft] = useState<DraftDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ draft: DraftDTO }>(`/api/trips/${trip.id}/draft`);
      setDraft(d.draft);
    } catch {
      /* 아직 안 짰으면 404 다 — 없는 것이 정상이라 조용히 넘긴다 */
      setDraft(null);
    }
  }, [trip.id]);

  useEffect(() => {
    void load();
    /* 냥이에게 "일정 짜줘" 하면 저장은 서버에서 일어난다. 그 결과가 화면에
       닿게 하려고 15초마다 한 번 들여다본다 */
    const t = setInterval(() => { if (!document.hidden) void load(); }, 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (!draft?.items?.length) return null;

  async function drop() {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/api/trips/${trip.id}/draft`, { method: "DELETE" });
      setDraft(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "버리지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">설계 에이전트가 짠 하루</h3>
        <button className="btn btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={drop}>
          버리고 다시 짜기
        </button>
      </div>
      <ol className="mt-2 flex flex-col gap-2">
        {draft.items.map((it, i) => (
          <li key={`${it.time}-${i}`}
            className="rounded-xl border border-rule bg-card p-3"
            style={{ borderLeft: "6px solid var(--brand)" }}>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-sm font-bold text-brand">{it.time}</span>
              <b className="flex-1">{it.name}</b>
              <span className="chip text-[11px]">{KIND[it.kind] ?? it.kind}</span>
              {it.minutes ? (
                <span className="font-mono text-[12px] text-muted">{it.minutes}분</span>
              ) : null}
            </div>
            {it.note && <p className="mt-1 text-[12.5px] text-ink-2">{it.note}</p>}
          </li>
        ))}
      </ol>
      {draft.tips?.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {draft.tips.map((t, i) => (
            <li key={i} className="rounded-lg bg-brand-soft px-3 py-2 text-[12.5px] text-brand">
              {t}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-muted">
        지도 데이터가 없는 지역이라 거리·이동 시간은 재지 않습니다. 시간표만 잡아 둡니다.
      </p>
    </div>
  );
}

function EmptyFrame({
  trip, day, note, tone, mapped,
}: { trip: Trip; day: ParkDay | null; note?: string; tone?: "bad"; mapped?: boolean }) {
  const slots = [
    { k: "일정", v: "0개" },
    { k: "이동 거리", v: "— km" },
    { k: "이동 시간", v: "—분" },
    { k: "끝나는 시각", v: "—" },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 pb-28 lg:grid lg:grid-cols-[3.4fr_6.4fr_3.2fr] lg:overflow-hidden lg:pb-3">
      {/* ───────── 오늘의 일정 ───────── */}
      <section className="order-3 shrink-0 lg:order-none lg:min-h-0 lg:shrink lg:overflow-y-auto lg:pr-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">오늘의 일정</h2>
          <button className="btn" disabled title="일정이 들어오면 쓸 수 있습니다">동선 최적화</button>
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          일정이 들어오면 카드를 끌어 순서를 바꿀 수 있습니다.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {slots.map((s) => <Fact key={s.k} k={s.k} v={s.v} />)}
        </dl>
        {/* 설계 에이전트가 짠 것이 있으면 그걸 보여 준다. 없으면 빈 자리 */}
        <DraftTable trip={trip} />
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i}
              className="rounded-xl border border-dashed border-rule bg-card/40 p-3"
              style={{ borderLeft: "6px solid var(--rule)" }}>
              <div className="flex items-baseline gap-2">
                <span className="select-none text-muted">⠿</span>
                <span className="font-mono text-sm text-muted">--:--</span>
                <b className="flex-1 text-muted">{i + 1}번째 일정이 들어올 자리</b>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── 지도 ───────── */}
      <section className="order-2 flex h-[58vh] shrink-0 flex-col overflow-hidden rounded-2xl border border-rule bg-card p-2 lg:order-none lg:h-auto lg:min-h-0 lg:shrink">
        <DayStrip trip={trip} day={day} />
        <div className="relative min-h-0 flex-1 rounded-xl border border-dashed border-rule bg-paper">
          <div className="absolute inset-0 grid place-content-center px-6">
            <div className="mx-auto flex max-w-md items-center gap-4">
              <CatFace who="designer" size={72} ring="border-brand" />
              <div>
                <p className={`text-sm ${tone === "bad" ? "font-bold text-rose" : "text-ink-2"}`}>
                  {note ?? (mapped
                    ? <><b>{trip.place || trip.title}</b> 일정이 아직 비어 있습니다. 아래 냥이 버튼을 눌러 &ldquo;일정 짜줘&rdquo;라고 하거나, 지도에서 갈 곳을 눌러 넣으세요.</>
                    : <><b>{trip.place || trip.title}</b>는 아직 지도 데이터가 없습니다. 설계 에이전트가 하루 시간표를 짭니다 — 아래 냥이 버튼을 눌러 &ldquo;일정 짜줘&rdquo;라고 해 보세요.</>)}
                </p>
                <p className="mt-2 text-[12.5px] text-muted">지도가 들어올 자리입니다.</p>
              </div>
            </div>
          </div>
        </div>
        <p className="flex-none px-2 pt-2 text-[12.5px] text-muted">
          일정이 생기면 여기에 구역별 색으로 핀과 이동 경로가 그려집니다.
        </p>
      </section>

      {/* ───────── 길안내 ───────── */}
      <section className="order-1 shrink-0 lg:order-none lg:min-h-0 lg:shrink lg:overflow-y-auto">
        <h2 className="text-lg font-bold">길안내</h2>
        <p className="font-mono text-xs text-muted">0 / 0</p>
        <div className="mt-3 rounded-2xl border border-dashed border-rule bg-card/40 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 flex-none place-content-center rounded-full bg-paper text-xl text-muted">→</span>
            <div className="min-w-0">
              <p className="text-lg font-bold text-muted">다음 목적지</p>
              <p className="font-mono text-xs text-muted">— m · —분 · --:-- 도착</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-2">
            첫 일정이 정해지면 걸어갈 거리와 돌 지점을 여기에 적고, 내 위치를 켜면 남은 거리를 실시간으로 알려 줍니다.
          </p>
          <button className="btn mt-3 w-full" disabled>안내 시작 — 일정이 필요합니다</button>
        </div>
      </section>
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
