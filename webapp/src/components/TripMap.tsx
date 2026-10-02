"use client";

import { useMemo } from "react";
import type { PlanRowDTO } from "./PlanBoard";
import type { MapInfo } from "./TripWorkspace";

/* 경로 색 — 하루를 셋으로 나눠 아침·낮·저녁.
   지도의 물·녹지와 섞이지 않도록 채도가 높은 색만 쓴다. */
export const PHASE = ["#D6336C", "#E07B1F", "#6B3FD4"];
export const phaseOf = (i: number, n: number) =>
  PHASE[i < n / 3 ? 0 : i < (2 * n) / 3 ? 1 : 2];

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

  // 핀 자체도 피한다
  for (const r of rows) taken.push({ x: r.x - 11, y: r.y - 11, w: 22, h: 22 });

  return rows.map((r) => {
    const text = `${r.at} ${r.name}`;
    const w = text.length * 6.2 + 6;
    const h = 14;
    for (const [dx, dy, anchor] of CANDIDATES) {
      const cx = r.x + dx;
      const cy = r.y + dy;
      const left = anchor === "start" ? cx : anchor === "end" ? cx - w : cx - w / 2;
      const box = { x: left, y: cy - 11, w, h };
      if (box.x < 2 || box.y < 2 || box.x + box.w > vw - 2 || box.y + box.h > vh - 2) continue;
      if (hit(box)) continue;
      taken.push(box);
      return { text, x: cx, y: cy, anchor };
    }
    return null;   // 자리가 없으면 라벨을 포기한다 (번호는 핀에 있다)
  });
}

export default function TripMap({
  map, rows,
}: {
  map: MapInfo;
  rows: PlanRowDTO[];
}) {
  const labels = useMemo(() => placeLabels(rows, map.vw, map.vh), [rows, map.vw, map.vh]);

  return (
    <svg
      viewBox={`0 0 ${map.vw} ${map.vh}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full"
    >
      <g dangerouslySetInnerHTML={{ __html: map.base }} />

      {/* 경로 — 흰 테두리를 깔아 어떤 바탕에서도 읽히게 한다 */}
      <g strokeLinecap="round" strokeLinejoin="round" fill="none">
        {rows.map((r) =>
          r.leg && r.leg.pts.length > 1 ? (
            <path key={`c-${r.id}`}
              d={`M ${r.leg.pts.map((p) => `${p[0]} ${p[1]}`).join(" L ")}`}
              stroke="#fff" strokeWidth={7} opacity={0.95} />
          ) : null,
        )}
        {rows.map((r, i) =>
          r.leg && r.leg.pts.length > 1 ? (
            <path key={`l-${r.id}`}
              d={`M ${r.leg.pts.map((p) => `${p[0]} ${p[1]}`).join(" L ")}`}
              stroke={phaseOf(i, rows.length)} strokeWidth={3.6} />
          ) : null,
        )}
      </g>

      {/* 핀 */}
      <g>
        {rows.map((r, i) => (
          <g key={`p-${r.id}`}>
            <circle cx={r.x} cy={r.y} r={11} fill="#fff" />
            <circle cx={r.x} cy={r.y} r={9.5} fill={phaseOf(i, rows.length)} />
            <text x={r.x} y={r.y + 3.6} textAnchor="middle" fontSize={10.5}
              fontWeight={700} fill="#fff">{r.no}</text>
          </g>
        ))}
      </g>

      {/* 라벨 — 흰 외곽선(paint-order)으로 지도 위에서도 읽히게 */}
      <g style={{ paintOrder: "stroke" }}>
        {labels.map((l, i) =>
          l ? (
            <text key={`t-${i}`} x={l.x} y={l.y} textAnchor={l.anchor}
              fontSize={11} fontWeight={700} fill="#3A2F3F"
              stroke="#fff" strokeWidth={3.2} strokeLinejoin="round">
              {l.text}
            </text>
          ) : null,
        )}
      </g>
    </svg>
  );
}
