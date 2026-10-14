"use client";

import { useRef, useState } from "react";
import AgentFlow, { emptyFlow, type Flow, type FlowCall } from "./AgentFlow";
import CatFace from "./CatFace";
import { chiefStream } from "@/lib/api";

interface Evidence { tool: string; output: unknown }

type Msg =
  | { role: "me"; text: string }
  | { role: "sys"; text: string }
  | { role: "bot"; text: string; who?: string; evidence?: Evidence[]; model?: string };

export default function ChiefDock({
  tripId, onChanged,
}: {
  tripId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: "무엇을 해드릴까요? 일정을 바꾸거나, 사진을 정리하거나, 오늘 쓴 돈을 물어보세요." },
  ]);
  /* 말풍선과 같은 이벤트를 그림으로도 적어 둔다 (AgentFlow 가 그린다) */
  const [flow, setFlow] = useState<Flow>(emptyFlow);
  const logRef = useRef<HTMLDivElement>(null);

  const push = (m: Msg) => setMsgs((prev) => [...prev, m]);
  const scroll = () =>
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });

  async function ask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("q") as HTMLInputElement;
    const q = input.value.trim();
    if (!q || busy) return;
    input.value = "";
    push({ role: "me", text: q });
    setBusy(true);
    setFlow({ agents: [], phase: "routing" });
    scroll();

    let answer = "";
    let answerStarted = false;
    let lastAgent = "chief";
    try {
      for await (const ev of chiefStream(tripId, q)) {
        if (ev.type === "route") {
          const why = String(ev.why ?? "");
          if (why) push({ role: "sys", text: why });
          /* 맡을 사람을 미리 다 그려 둔다 — 누가 남았는지 보이라고 */
          const ids = (Array.isArray(ev.agents) ? ev.agents : []).map(String);
          const names = (Array.isArray(ev.names) ? ev.names : []).map(String);
          setFlow({
            why,
            phase: ids.length ? "working" : "speaking",
            agents: ids.map((id, i) => ({
              id, name: names[i] ?? id, state: "wait" as const, calls: [],
            })),
          });
        } else if (ev.type === "handoff") {
          push({ role: "sys", text: `총괄 → ${ev.name} 에이전트에게 맡김` });
          lastAgent = String(ev.agent ?? "chief");
          const id = String(ev.agent ?? "");
          setFlow((f) => ({
            ...f,
            agents: f.agents.map((a) => (a.id === id ? { ...a, state: "run" } : a)),
          }));
        } else if (ev.type === "text") {
          answer += String(ev.delta ?? "");
          setMsgs((prev) => {
            const next = prev.slice();
            if (answerStarted) next[next.length - 1] = { role: "bot", text: answer, who: "chief" };
            else next.push({ role: "bot", text: answer, who: "chief" });
            return next;
          });
          answerStarted = true;
        } else if (ev.type === "report") {
          const t = String(ev.text ?? "").trim();
          const calls = (Array.isArray(ev.calls) ? ev.calls : []) as Evidence[];
          push({
            role: "bot",
            who: String(ev.agent ?? lastAgent),
            /* 도구를 안 쓴 답은 서버가 버리고 빈 문자열로 온다 — 그 사실을 그대로 말한다 */
            text: t || (calls.length
              ? `도구 ${calls.length}개를 돌렸습니다. 아래 결과를 보세요.`
              : "도구를 쓰지 않아 답을 버렸습니다. 아래 화면의 숫자를 봐 주세요."),
            evidence: calls,
            model: ev.model ? String(ev.model) : undefined,
          });
          const id = String(ev.agent ?? "");
          /* 도구 이름과 걸린 시간만 그림으로 옮긴다 (값은 아래 말풍선에 이미 있다) */
          const steps: FlowCall[] = (Array.isArray(ev.calls) ? ev.calls : [])
            .map((c) => ({ tool: String((c as FlowCall).tool ?? "?"), ms: Number((c as FlowCall).ms ?? 0) }));
          setFlow((f) => {
            const agents = f.agents.map((a) =>
              a.id === id
                ? { ...a, state: "done" as const, calls: steps,
                    ms: Number(ev.ms ?? 0),
                    tier: ev.tier ? String(ev.tier) : undefined,
                    model: ev.model ? String(ev.model) : undefined }
                : a,
            );
            /* 다 끝났으면 총괄이 말할 차례다 */
            const left = agents.some((a) => a.state !== "done");
            return { ...f, agents, phase: left ? "working" : "speaking" };
          });
        } else if (ev.type === "done") {
          setFlow((f) => ({ ...f, phase: "done" }));
        } else if (ev.type === "error") {
          push({ role: "bot", text: `문제가 생겼습니다: ${ev.message}` });
          setFlow((f) => ({ ...f, phase: "error" }));
        }
        scroll();
      }
      onChanged();
    } catch (e2) {
      push({ role: "bot", text: e2 instanceof Error ? e2.message : "답을 받지 못했습니다." });
    } finally {
      setBusy(false);
      scroll();
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="총괄 냥이에게 묻기"
        className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg transition hover:-translate-y-1"
      >
        <CatFace who="chief" size={68} ring="border-brand" className="border-[3px]" />
        <span className="absolute -left-2 -top-2 grid h-7 w-7 place-content-center rounded-full rounded-bl-[4px] bg-brand font-bold text-white shadow">
          ?
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border-2 border-brand bg-card shadow-2xl">
      <header className="flex items-center gap-2 border-b border-rule bg-brand-soft px-4 py-2">
        <CatFace who="chief" size={24} />
        <b className="text-sm">총괄 냥이</b>
        <button onClick={() => setOpen(false)} className="ml-auto text-muted" aria-label="닫기">✕</button>
      </header>

      <AgentFlow flow={flow} />

      <div ref={logRef} className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto p-3 text-sm">
        {msgs.map((m, i) =>
          m.role === "sys" ? (
            <p key={i} className="self-center rounded-full bg-paper px-3 py-1 text-[12.5px] text-muted">
              {m.text}
            </p>
          ) : m.role === "me" ? (
            <p key={i} className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl bg-brand px-3 py-2 text-white">
              {m.text}
            </p>
          ) : (
            <div key={i} className="flex max-w-[92%] items-start gap-2 self-start">
              <CatFace who={m.who ?? "chief"} size={28} />
              <div className="min-w-0">
                <p className="whitespace-pre-wrap rounded-2xl bg-paper px-3 py-2">{m.text}</p>
                {/* 모델이 숫자를 틀리게 옮기는 일이 있다. 도구가 준 값을 함께 둬서
                    사용자가 바로 대조할 수 있게 한다. */}
                {m.evidence && m.evidence.length > 0 && (
                  <details className="mt-1 rounded-xl border border-rule bg-card px-3 py-1.5">
                    <summary className="cursor-pointer text-[12.5px] text-muted">
                      도구가 준 실제 값 {m.model && <span className="font-mono">· {m.model}</span>}
                    </summary>
                    {m.evidence.map((e, k) => (
                      <div key={k} className="mt-1">
                        <p className="font-mono text-[12.5px] font-bold text-brand">{e.tool}</p>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[12.5px] text-ink-2">
                          {JSON.stringify(e.output, null, 1)}
                        </pre>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            </div>
          ),
        )}
        {busy && <p className="self-start text-[12.5px] text-muted">생각하는 중…</p>}
      </div>

      <form onSubmit={ask} className="flex items-center gap-2 border-t border-rule px-3 py-2">
        <input name="q" autoComplete="off" placeholder="총괄 냥이에게 묻기"
          className="flex-1 bg-transparent py-1 outline-none" />
        <button disabled={busy} className="font-mono text-xs text-brand disabled:opacity-40">↵</button>
      </form>
    </div>
  );
}
