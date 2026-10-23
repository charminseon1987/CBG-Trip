"use client";

import CatFace from "./CatFace";

/* 에이전트들이 일하는 모습을 그린다.

   /api/chief 가 흘려보내는 것을 그대로 받아 그린다 — 새로 묻지 않는다.
     route   누구에게, 왜 맡기는지          → 가지를 미리 전부 그린다(회색)
     handoff 그 중 하나가 지금 돈다          → 맥박
     report  끝. 어떤 도구를 몇 ms 에 불렀나 → 가지 아래에 펼친다

   도구 호출은 **끝나야** 온다(report 에 묶여서). 그래서 도는 동안에는
   맥박만 뛰고 도구 줄은 비어 있다. 한 걸음씩 흘리려면 harness 를 고쳐야
   하는데, 그만한 값은 아직 없다고 봤다 — 끝난 뒤 다 보이면 충분하다.

   좁은 독(26rem) 안에 들어가야 해서 가로가 아니라 **세로 나무**로 그린다. */

export interface FlowCall { tool: string; ms: number }
export interface FlowAgent {
  id: string;
  name: string;
  state: "wait" | "run" | "done";
  model?: string;
  tier?: string;
  ms?: number;
  calls: FlowCall[];
}
export interface Flow {
  why?: string;
  agents: FlowAgent[];
  /* idle 은 아직 아무것도 안 물어본 상태 — 그때는 아예 안 그린다 */
  phase: "idle" | "routing" | "working" | "speaking" | "done" | "error";
}

export const emptyFlow = (): Flow => ({ agents: [], phase: "idle" });

const ms = (n?: number) => (n == null ? "" : n >= 1000 ? `${(n / 1000).toFixed(1)}초` : `${n}ms`);

/** 도는 중이면 맥박, 끝났으면 꽉 찬 점, 아직이면 빈 점 */
function Dot({ state }: { state: FlowAgent["state"] }) {
  const look =
    state === "run" ? "bg-brand animate-pulse"
    : state === "done" ? "bg-brand"
    : "bg-transparent border border-rule";
  return <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${look}`} />;
}

export default function AgentFlow({ flow }: { flow: Flow }) {
  if (flow.phase === "idle") return null;

  /* 도는 중인 것은 아직 끝난 게 아니다 — 끝난 수만 센다.
     "진행" 으로 세면 둘째가 도는 중인데 (2/2) 가 되어 다 끝난 듯 보인다 */
  const done = flow.agents.filter((a) => a.state === "done").length;
  const total = flow.agents.length;

  return (
    <section
      aria-label="냥이들이 일하는 흐름"
      className="border-b border-rule bg-paper px-3 py-2.5 text-[12.5px]"
    >
      {/* ── 총괄: 누구에게 왜 맡겼나 ── */}
      <div className="flex items-start gap-2">
        <CatFace who="chief" size={22} ring="border-brand" />
        <div className="min-w-0 flex-1">
          <b className="text-ink">Chief</b>{" "}
          <span className="text-muted">
            {flow.phase === "routing"
              ? "누구에게 맡길지 고르는 중…"
              : total === 0
                ? (flow.phase === "error" ? "" : "혼자 답합니다")
                : `${total}명에게 맡김 (${done}/${total} 끝남)`}
          </span>
          {flow.why && <p className="mt-0.5 whitespace-pre-wrap text-muted">“{flow.why}”</p>}
        </div>
      </div>

      {/* ── 가지: 에이전트마다 한 줄, 그 아래 도구 ── */}
      {flow.agents.length > 0 && (
        <ul className="mt-1.5 ml-[10px] list-none border-l border-rule pl-3">
          {flow.agents.map((a) => (
            <li key={a.id} className="flex items-start gap-2 py-1">
              <Dot state={a.state} />
              <CatFace
                who={a.id}
                size={20}
                ring={a.state === "wait" ? "border-rule" : "border-brand"}
                className={a.state === "wait" ? "opacity-40" : ""}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <b className={a.state === "wait" ? "text-muted" : "text-ink"}>{a.name}</b>
                  {a.state === "run" && <span className="text-brand">도는 중…</span>}
                  {a.state === "done" && <span className="text-muted">{ms(a.ms)}</span>}
                  {/* 어느 등급이 어느 모델로 갔는지 — 분배가 말뿐이 아님을 눈으로 본다 */}
                  {a.model && (
                    <span className="font-mono text-[11.5px] text-muted">
                      {a.tier}·{a.model}
                    </span>
                  )}
                </div>

                {a.calls.length > 0 && (
                  <ol className="mt-0.5 list-none space-y-[1px]">
                    {a.calls.map((c, i) => (
                      <li key={i} className="flex items-baseline gap-1.5 text-muted">
                        <span className="font-mono text-[11.5px]">↳ {c.tool}</span>
                        <span className="text-[11.5px]">{ms(c.ms)}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {a.state === "done" && a.calls.length === 0 && (
                  <p className="mt-0.5 text-muted">도구를 쓰지 않았습니다.</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── 다시 총괄: 모아서 말한다 ── */}
      {(flow.phase === "speaking" || flow.phase === "done" || flow.phase === "error") && (
        <div className="mt-1 flex items-center gap-2">
          <span className="ml-[10px] h-3 w-px bg-rule" />
          <span className="text-muted">
            {flow.phase === "error"
              ? "중간에 멈췄습니다"
              : flow.phase === "speaking"
                ? "Chief 가 모아서 말하는 중…"
                : "Chief 가 모아서 말했습니다"}
          </span>
        </div>
      )}
    </section>
  );
}
