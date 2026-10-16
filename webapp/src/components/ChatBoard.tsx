"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/* 대화창. 여행 그룹 방과 일대일 방이 같은 화면을 쓴다 — 주소만 다르다.

   실시간은 8초마다 다시 읽는 것으로 둔다. WebSocket 을 깔면 서버가 늘 붙어
   있어야 하는데, 이 앱은 서버리스(Vercel) 위에서 돌아 그 모양이 맞지 않는다.
   가족 몇 명이 쓰는 대화에 8초면 충분하다. */

export interface Share {
  id: string; title: string; place: string; date: string; end: string;
}
export interface Msg {
  id: string; authorId: string; authorName: string;
  body: string; createdAt: string; share: Share | null;
}

export type Room =
  | { kind: "trip"; tripId: string; title?: string }
  | { kind: "dm"; userId: string; name: string };

const path = (r: Room) =>
  r.kind === "trip" ? `/api/trips/${r.tripId}/chat` : `/api/chat/dm/${r.userId}`;

const clock = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const span = (s: Share) => (s.end && s.end !== s.date ? `${s.date} ~ ${s.end}` : s.date);

export default function ChatBoard({
  room, shareable,
}: {
  room: Room;
  /** 메시지에 붙일 수 있는 내 여행들 — 없으면 카드 붙이기를 숨긴다 */
  shareable?: { id: string; title: string }[];
}) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [share, setShare] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ messages: Msg[]; me: string | null }>(path(room));
      setMsgs(d.messages);
      setMe(d.me);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.kind, room.kind === "trip" ? room.tripId : room.userId]);

  useEffect(() => {
    void load();
    /* 8초마다 새로 읽는다. 화면이 숨어 있으면 쉰다 — 가만히 둔 탭이
       하루 종일 서버를 두드리게 할 이유가 없다 */
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 8000);
    return () => clearInterval(t);
  }, [load]);

  /* 새 말이 오면 아래로 */
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs?.length]);

  async function send() {
    const body = text.trim();
    if (!body && !share) return;
    setBusy(true); setErr(null);
    try {
      await api(path(room), {
        method: "POST",
        body: JSON.stringify({ body, shareTripId: share || null }),
      });
      setText(""); setShare("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "보내지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-4">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {!msgs ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : msgs.length === 0 ? (
          <p className="mt-6 text-sm text-muted">
            {room.kind === "trip"
              ? "아직 아무 말도 없습니다. 같이 가는 사람들에게 첫 말을 걸어 보세요."
              : "아직 주고받은 말이 없습니다."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {msgs.map((m) => {
              const mine = m.authorId === me;
              return (
                <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {!mine && (
                    <span className="px-1 text-[11px] font-bold text-muted">{m.authorName}</span>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? "bg-brand text-white" : "border border-rule bg-card"
                    }`}
                  >
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    {/* 붙인 여행 카드 — 제목·지역·날짜까지. 멤버가 아니면 눌러도 404 다 */}
                    {m.share && (
                      <a
                        href={`/trips/${m.share.id}`}
                        className={`mt-1 block rounded-xl px-3 py-2 ${
                          mine ? "bg-white/15" : "bg-paper"
                        }`}
                      >
                        <b className="block text-[13px]">{m.share.title}</b>
                        <span className="block text-[12px] opacity-80">
                          {m.share.place} · {span(m.share)}
                        </span>
                        <span className="block text-[11px] opacity-70">여행 보기 →</span>
                      </a>
                    )}
                  </div>
                  <span className="px-1 text-[10px] text-muted">{clock(m.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      {err && (
        <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm font-bold text-brand">{err}</p>
      )}

      <div className="mt-3 flex flex-none flex-wrap items-end gap-2">
        {/* 여행 카드 붙이기 — 내가 들어가 있는 여행만 */}
        {!!shareable?.length && (
          <select
            value={share}
            onChange={(e) => setShare(e.target.value)}
            aria-label="여행 정보 붙이기"
            className="rounded-lg border border-rule bg-card px-2 py-2 text-sm"
          >
            <option value="">여행 붙이기 없음</option>
            {shareable.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            /* 엔터로 보내고 시프트+엔터로 줄바꿈 — 손이 아는 방식 */
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          rows={2}
          maxLength={2000}
          placeholder="할 말 (엔터로 보내기 · 시프트+엔터 줄바꿈)"
          aria-label="할 말"
          className="min-w-0 flex-1 resize-none rounded-lg border border-rule bg-card px-3 py-2 text-sm"
        />
        <button className="btn btn-primary px-4 py-2" disabled={busy} onClick={send}>
          {busy ? "보내는 중…" : "보내기"}
        </button>
      </div>
    </div>
  );
}
