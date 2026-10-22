/* ============================================================
   관리 화면의 차트 — 라이브러리 없이 서버에서 SVG 로 굽는다.

   차트 라이브러리를 붙이면 관리 화면 하나를 위해 번들이 커진다.
   여기서 필요한 건 막대와 가로 막대뿐이라 손으로 그리는 편이 낫다.
   툴팁은 <title> — 브라우저가 알아서 띄워 준다.
   ============================================================ */
import type { DayCount, TokenDay } from "@/lib/stats";

/* 에이전트 id → 한국어 이름·색. registry 의 이름과 맞춰 두되,
   장부에만 있는 낯선 id 가 와도 죽지 않게 기본값을 둔다 */
const AGENT_LABEL: Record<string, string> = {
  plan: "일정", designer: "설계", pass: "패스권", album: "앨범",
  ledger: "회계", chief: "총괄", classify: "분류",
};
const AGENT_COLOR: Record<string, string> = {
  plan: "var(--z-global)", designer: "var(--z-magic)", pass: "var(--z-amer)",
  album: "var(--z-zoo)", ledger: "var(--gold)", chief: "var(--brand)",
  classify: "var(--muted)",
};
export const agentLabel = (id: string) => AGENT_LABEL[id] ?? id;
export const agentColor = (id: string) => AGENT_COLOR[id] ?? "var(--z-global)";

export const fmt = (n: number) => n.toLocaleString("ko-KR");
/** 큰 수는 만·억으로 접는다 — 123,400 → "12.3만" */
export const fmtMan = (n: number) =>
  n >= 1e8 ? `${(n / 1e8).toFixed(1)}억`
  : n >= 1e4 ? `${(n / 1e4).toFixed(1)}만`
  : fmt(n);

const md = (d: string) => d.slice(5).replace("-", "/");

/* ---------- 세로 막대 ---------- */

/** 겹쳐 쌓는 막대 — 입력(파랑) 위에 출력(분홍). 토큰의 일별 추이용 */
export function StackedBars({
  rows, a, b, labelA, labelB, colorA, colorB, height = 150,
}: {
  rows: TokenDay[];
  a: (r: TokenDay) => number; b: (r: TokenDay) => number;
  labelA: string; labelB: string;
  colorA: string; colorB: string;
  height?: number;
}) {
  const W = 720, H = height, padL = 34, padB = 18, padT = 8;
  const inner = H - padB - padT;
  const max = Math.max(1, ...rows.map((r) => a(r) + b(r)));
  /* 눈금은 보기 좋은 수로 — 1·2·5 의 배수 중에서 고른다 */
  const nice = (v: number) => {
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [5, 2, 1]) if (v / p >= m) return m * p;
    return p;
  };
  const step = nice(Math.ceil(max / 3));
  const ticks = [0, step, step * 2, step * 3].filter((t) => t <= max * 1.05);
  /* 날짜가 적으면 막대가 지나치게 굵어진다 — 너비에 상한을 둔다 */
  const bw = Math.min(34, Math.max(4, (W - padL - 8) / rows.length - 4));
  const gap = (W - padL - 8) / rows.length;
  const labelEvery = rows.length > 20 ? 7 : rows.length > 10 ? 3 : 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {ticks.map((t) => {
        const y = padT + inner - (t / max) * inner;
        return (
          <g key={t}>
            <line x1={padL} x2={W - 4} y1={y} y2={y} stroke="var(--rule)" strokeWidth={t ? 1 : 1.5} />
            <text x={padL - 5} y={y + 3} textAnchor="end" fontSize={9} fill="var(--muted)">
              {fmtMan(t)}
            </text>
          </g>
        );
      })}
      {rows.map((r, i) => {
        const x = padL + 4 + i * gap + (gap - bw) / 2;
        const va = a(r), vb = b(r);
        const ha = (va / max) * inner, hb = (vb / max) * inner;
        const yBase = padT + inner;
        return (
          <g key={r.date}>
            <title>{`${md(r.date)} · ${labelA} ${fmt(va)} · ${labelB} ${fmt(vb)}`}</title>
            {vb > 0 && (
              <rect x={x} y={yBase - hb} width={bw} height={hb} rx={2} fill={colorB} />
            )}
            {va > 0 && (
              <rect x={x} y={yBase - hb - ha} width={bw} height={ha} rx={2} fill={colorA} />
            )}
            {i % labelEvery === 0 && (
              <text x={x + bw / 2} y={H - 5} textAnchor="middle" fontSize={9} fill="var(--muted)">
                {md(r.date)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** 단순 막대 — 가입 추이 같은 한 값 시리즈 */
export function Bars({ rows, color, height = 120 }: {
  rows: DayCount[]; color: string; height?: number;
}) {
  const W = 720, H = height, padL = 10, padB = 18, padT = 8;
  const inner = H - padB - padT;
  const max = Math.max(1, ...rows.map((r) => r.n));
  const bw = Math.min(34, Math.max(4, (W - padL - 8) / rows.length - 4));
  const gap = (W - padL - 8) / rows.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      <line x1={padL} x2={W - 4} y1={padT + inner} y2={padT + inner} stroke="var(--rule)" strokeWidth={1.5} />
      {rows.map((r, i) => {
        const x = padL + 4 + i * gap + (gap - bw) / 2;
        const h = (r.n / max) * inner;
        return (
          <g key={r.date}>
            <title>{`${md(r.date)} · ${fmt(r.n)}명`}</title>
            {r.n > 0 && (
              <rect x={x} y={padT + inner - h} width={bw} height={h} rx={2} fill={color} />
            )}
            {i % 7 === 0 && (
              <text x={x + bw / 2} y={H - 5} textAnchor="middle" fontSize={9} fill="var(--muted)">
                {md(r.date)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- 가로 막대 ---------- */

/** 에이전트별 토큰 — 누가 제일 쓰는지 한눈에 */
export function AgentShare({ rows }: {
  rows: { agent: string; runs: number; input: number; output: number }[];
}) {
  if (!rows.length) return <Empty text="아직 모델을 부른 기록이 없습니다" />;
  const max = Math.max(1, ...rows.map((r) => r.input + r.output));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const total = r.input + r.output;
        /* usage 를 못 받은 실행은 0·0 — 나누기가 NaN 이 되지 않게 1 로 눌러 둔다 */
        const share = total || 1;
        return (
          <div key={r.agent} className="grid grid-cols-[3.2rem_1fr_auto] items-center gap-2 text-sm">
            <span className="font-bold">{agentLabel(r.agent)}</span>
            <div className="h-3.5 overflow-hidden rounded-full bg-paper">
              <div className="flex h-full" style={{ width: `${(total / max) * 100}%` }}>
                <div style={{ width: `${(r.input / share) * 100}%`, background: "var(--z-global)" }} />
                <div style={{ width: `${(r.output / share) * 100}%`, background: "var(--brand)" }} />
              </div>
            </div>
            <span className="font-mono text-xs text-ink-2">
              {fmtMan(total)} <span className="text-muted">· {r.runs}회</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="grid place-content-center rounded-xl border border-dashed border-rule py-8 text-sm text-muted">
      {text}
    </div>
  );
}
