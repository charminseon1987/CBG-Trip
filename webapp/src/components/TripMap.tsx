"use client";

import { useMemo } from "react";
import type { Candidate, PlanRowDTO, RegionDTO } from "./PlanBoard";

/* 구역 색은 지역팩이 들고 온다. 팩에 없으면 이 순서로 돌려 쓴다. */
const FALLBACK = ["var(--z-global)", "var(--z-zoo)", "var(--z-euro)", "var(--z-magic)", "var(--z-amer)", "var(--gold)"];

export function zoneColorMap(region: RegionDTO): Record<string, string> {
  const m: Record<string, string> = {};
  region.zones?.forEach((z, i) => { m[z.id] = z.color || FALLBACK[i % FALLBACK.length]; });
  return m;
}

/** 라벨이 서로 겹치지 않게 자리를 고른다 */
const CANDIDATES: [number, number, "start" | "end" | "middle"][] = [
  [14, 4, "start"], [-14, 4, "end"], [0, -14, "middle"], [0, 22, "middle"],
  [14, -12, "start"], [-14, -12, "end"], [14, 20, "start"], [-14, 20, "end"],
  [0, -28, "middle"], [0, 36, "middle"],
];

function placeLabels(rows: PlanRowDTO[], vw: number, vh: number) {
  const taken: { x: number; y: number; w: number; h: number }[] = [];
  const hit = (b: (typeof taken)[number]) =>
    taken.some((t) => !(b.x + b.w < t.x || t.x + t.w < b.x || b.y + b.h < t.y || t.y + t.h < b.y));
  for (const r of rows) taken.push({ x: r.x - 12, y: r.y - 12, w: 24, h: 24 });

  return rows.map((r) => {
    const text = `${r.at} ${r.name}`;
    const w = text.length * 6.2 + 6;
    for (const [dx, dy, anchor] of CANDIDATES) {
      const cx = r.x + dx, cy = r.y + dy;
      const left = anchor === "start" ? cx : anchor === "end" ? cx - w : cx - w / 2;
      const box = { x: left, y: cy - 11, w, h: 14 };
      if (box.x < 2 || box.y < 2 || box.x + box.w > vw - 2 || box.y + box.h > vh - 2) continue;
      if (hit(box)) continue;
      taken.push(box);
      return { text, x: cx, y: cy, anchor };
    }
    return null;
  });
}

export default function TripMap({
  region, rows, candidates, cursor, showZone, onPick,
}: {
  region: RegionDTO;
  rows: PlanRowDTO[];
  candidates: Candidate[];
  cursor: number;
  showZone: string | null;          // 고른 구역만 밝게. null 이면 전부
  onPick: (kind: "in" | "out", id: string) => void;
}) {
  const zc = useMemo(() => zoneColorMap(region), [region]);
  const labels = useMemo(() => placeLabels(rows, region.vw, region.vh), [rows, region.vw, region.vh]);
  const dim = (zoneId: string) => (showZone && zoneId !== showZone ? 0.22 : 1);

  return (
    <svg
      viewBox={`0 0 ${region.vw} ${region.vh}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full"
    >
      <g dangerouslySetInnerHTML={{ __html: region.base }} />

      {/* 경로 — 흰 테두리 위에 구역 색. 지금 가야 할 구간은 굵게 흐른다 */}
      <g>
        {rows.map((r) =>
          r.leg && r.leg.pts.length > 1 ? (
            <path key={`c-${r.id}`} className="leg-casing"
              d={`M ${r.leg.pts.map((p) => `${p[0]} ${p[1]}`).join(" L ")}`} />
          ) : null,
        )}
        {rows.map((r, i) =>
          r.leg && r.leg.pts.length > 1 ? (
            <path
              key={`l-${r.id}`}
              className={`leg-line${i === cursor + 1 ? " is-current leg-flow" : ""}`}
              d={`M ${r.leg.pts.map((p) => `${p[0]} ${p[1]}`).join(" L ")}`}
              stroke={zc[r.zoneId] ?? "var(--brand)"}
              opacity={dim(r.zoneId)}
            />
          ) : null,
        )}
      </g>

      {/* 일정에 없는 곳 — 속이 빈 동그라미. 누르면 넣는다 */}
      <g>
        {candidates.map((c) => (
          <g key={`g-${c.id}`} className="pin pin-ghost" opacity={dim(c.zoneId)}
            onClick={() => onPick("out", c.id)}>
            <title>{`${c.name} — 누르면 일정에 넣습니다`}</title>
            <circle cx={c.x} cy={c.y} r={7} fill="#fff" stroke={zc[c.zoneId] ?? "var(--muted)"} strokeWidth={2.5} />
            <circle cx={c.x} cy={c.y} r={2.4} fill={zc[c.zoneId] ?? "var(--muted)"} />
          </g>
        ))}
      </g>

      {/* 일정에 있는 곳 — 누르면 뺀다 */}
      <g>
        {rows.map((r, i) => (
          <g key={`p-${r.id}`} className="pin" opacity={dim(r.zoneId)} onClick={() => onPick("in", r.id)}>
            <title>{`${r.at} ${r.name} — 누르면 일정에서 뺍니다`}</title>
            {i === cursor && <circle cx={r.x} cy={r.y} r={15} fill={zc[r.zoneId] ?? "var(--brand)"} opacity={0.25} />}
            <circle className="pin-ring" cx={r.x} cy={r.y} r={11} fill={zc[r.zoneId] ?? "var(--brand)"} />
            <text className="pin-num" x={r.x} y={r.y + 3.7} textAnchor="middle">{r.no}</text>
          </g>
        ))}
      </g>

      <g>
        {labels.map((l, i) =>
          l && dim(rows[i].zoneId) === 1 ? (
            <text key={`t-${i}`} className="map-label" x={l.x} y={l.y} textAnchor={l.anchor}>
              {l.text}
            </text>
          ) : null,
        )}
      </g>
    </svg>
  );
}
