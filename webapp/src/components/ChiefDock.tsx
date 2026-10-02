"use client";

import { useRef, useState } from "react";
import CatFace from "./CatFace";
import { chiefStream } from "@/lib/api";

type Msg =
  | { role: "me"; text: string }
  | { role: "sys"; text: string }
  | { role: "bot"; text: string; who?: string };

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
    scroll();

    let answer = "";
    let answerStarted = false;
    let lastAgent = "chief";
    try {
      for await (const ev of chiefStream(tripId, q)) {
        if (ev.type === "route") {
          const why = String(ev.why ?? "");
          if (why) push({ role: "sys", text: why });
        } else if (ev.type === "handoff") {
          push({ role: "sys", text: `총괄 → ${ev.name} 에이전트에게 맡김` });
          lastAgent = String(ev.agent ?? "chief");
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
          const calls = Array.isArray(ev.calls) ? ev.calls.length : 0;
          push({
            role: "bot",
            who: String(ev.agent ?? lastAgent),
            text: t || `도구 ${calls}개를 돌려 결과를 올렸습니다.`,
          });
        } else if (ev.type === "error") {
          push({ role: "bot", text: `문제가 생겼습니다: ${ev.message}` });
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

      <div ref={logRef} className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto p-3 text-sm">
        {msgs.map((m, i) =>
          m.role === "sys" ? (
            <p key={i} className="self-center rounded-full bg-paper px-3 py-1 text-[11px] text-muted">
              {m.text}
            </p>
          ) : m.role === "me" ? (
            <p key={i} className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl bg-brand px-3 py-2 text-white">
              {m.text}
            </p>
          ) : (
            <div key={i} className="flex max-w-[92%] items-start gap-2 self-start">
              <CatFace who={m.who ?? "chief"} size={28} />
              <p className="whitespace-pre-wrap rounded-2xl bg-paper px-3 py-2">{m.text}</p>
            </div>
          ),
        )}
        {busy && <p className="self-start text-[11px] text-muted">생각하는 중…</p>}
      </div>

      <form onSubmit={ask} className="flex items-center gap-2 border-t border-rule px-3 py-2">
        <input name="q" autoComplete="off" placeholder="총괄 냥이에게 묻기"
          className="flex-1 bg-transparent py-1 outline-none" />
        <button disabled={busy} className="font-mono text-xs text-brand disabled:opacity-40">↵</button>
      </form>
    </div>
  );
}
