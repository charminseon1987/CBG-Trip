"use client";

import CatFace from "./CatFace";
import TripMap, { phaseOf } from "./TripMap";
import type { MapInfo } from "./TripWorkspace";
import type { Trip } from "@/lib/types";

export interface PlanRowDTO {
  no: number; id: string; name: string; zone: string; x: number; y: number;
  at: string; end: string; stay: number; note: string; problem: string | null;
  leg: { m: number; pts: [number, number][] } | null;
  steps: { m: number; turn: string }[];
}

export interface PlanPayload {
  mapped: boolean;
  region?: { key: string; title: string; mode: "walk" | "drive"; speed: number; source: string };
  summary?: { stops: number; total_km: number; move_min: number; ends_at: string };
  rows?: PlanRowDTO[];
  candidates?: { id: string; name: string; zone: string; rank: number }[];
}

const TURN: Record<string, string> = {
  left: "왼쪽", right: "오른쪽", "sharp-left": "크게 왼쪽", "sharp-right": "크게 오른쪽",
};

export default function PlanBoard({
  trip, map, plan, error,
}: {
  trip: Trip;
  map: MapInfo | null;
  plan: PlanPayload | null;
  error: string | null;
  onChanged: () => void;
}) {
  if (error) return <Msg>{error}</Msg>;
  if (!plan) return <Msg>불러오는 중…</Msg>;
  if (!plan.mapped || !map || !plan.rows || !plan.summary) {
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

  const { rows, summary, region } = plan;
  const move = region?.mode === "drive" ? "이동" : "도보";
  const next = rows[1];

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[3fr_6fr_3fr]">
      {/* 오늘의 일정 */}
      <section className="min-h-0 overflow-y-auto pr-1">
        <h2 className="text-lg font-bold">오늘의 일정</h2>
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
                className="rounded-xl border border-rule bg-card p-3 shadow-sm"
                style={{ borderLeft: `5px solid ${phaseOf(i, rows.length)}` }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-sm font-bold">{r.at}</span>
                  <b className="flex-1 truncate">{r.name}</b>
                  <span className="font-mono text-[11px] text-muted">{r.stay}분</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">{r.zone}</p>
                {r.problem && <p className="mt-1 text-xs font-bold text-brand">{r.problem}</p>}
              </article>
            </div>
          ))}
        </div>
      </section>

      {/* 지도 */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-rule bg-card p-2">
        {/* SVG 는 비율대로 커지려 하므로 자리를 못박아 둔다 */}
        <div className="relative min-h-0 flex-1">
          <TripMap map={map} rows={rows} />
        </div>
        <p className="flex-none px-2 pt-2 text-[11px] leading-snug text-muted">{map.source}</p>
      </section>

      {/* 길안내 */}
      <section className="min-h-0 overflow-y-auto">
        <h2 className="text-lg font-bold">길안내</h2>
        {next ? (
          <div className="mt-3 rounded-2xl border border-rule bg-card p-4 shadow-sm">
            <p className="text-xl font-bold">{next.name}</p>
            <p className="mt-1 font-mono text-xs text-muted">
              {next.leg ? `${next.leg.m} m · ` : ""}
              {move} {next.leg ? Math.ceil(next.leg.m / (region?.speed ?? 70)) : 0}분 · {next.at} 도착
            </p>
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
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">오늘 일정이 끝났습니다.</p>
        )}

        {plan.candidates && plan.candidates.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-bold">일정에 없는 곳 {plan.candidates.length}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {plan.candidates.map((c) => (
                <span key={c.id}
                  className="rounded-full border border-rule bg-card px-2.5 py-1 text-xs text-ink-2">
                  {c.name}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              총괄에게 &ldquo;{plan.candidates[0].name} 넣어줘&rdquo; 라고 말하면 일정 담당이 거리 변화를 계산해 줍니다.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-xl bg-card px-3 py-2 shadow-sm">
    <dt className="text-[10px] uppercase tracking-wide text-muted">{k}</dt>
    <dd className="font-mono text-base font-bold">{v}</dd>
  </div>
);

const Msg = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-2xl px-6 py-10 text-ink-2">{children}</div>
);
