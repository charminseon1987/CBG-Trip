"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/* 머리글의 종. 눌러야 아는 것들을 한 자리에 모은다 —
   들어온 신청 · 내 신청 결과 · 안 읽은 말.

   30초마다 센다. 대화창(8초)보다 느리게 둔 까닭: 종은 "있다/없다" 만 알려
   주면 되고, 들어가면 그 화면이 제 속도로 갱신한다. 숨은 탭에서는 쉰다. */

interface Notice {
  kind: "join_request" | "join_result" | "chat";
  href: string;
  title: string;
  body: string;
  count: number;
  at: string;
}

const MARK: Record<Notice["kind"], string> = {
  join_request: "🚪",
  join_result: "✅",
  chat: "💬",
};

const ago = (iso: string) => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
};

export default function NoticeBell() {
  const [badge, setBadge] = useState(0);
  const [items, setItems] = useState<Notice[] | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ items: Notice[]; badge: number }>("/api/notices");
      setItems(d.items);
      setBadge(d.badge);
    } catch {
      /* 종이 안 떠도 앱은 돈다 — 조용히 넘긴다 */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  /* 바깥을 누르면 닫는다 */
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await load();
      /* 열었으면 "여기까지 봤다". 신청은 이걸로 안 사라진다 — 처리해야 사라진다 */
      try {
        await api("/api/notices/seen", { method: "POST" });
        await load();
      } catch { /* 넘긴다 */ }
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        className="btn"
        aria-label={badge ? `알림 ${badge}개` : "알림"}
        aria-expanded={open}
        onClick={toggle}
      >
        알림
        {badge > 0 && (
          <span className="ml-1 rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 max-h-[70vh] w-[min(22rem,80vw)] overflow-y-auto rounded-2xl border border-rule bg-card p-2 shadow-lg"
        >
          {!items ? (
            <p className="px-2 py-3 text-sm text-muted">세는 중…</p>
          ) : items.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">새로 볼 것이 없습니다.</p>
          ) : (
            <ul className="flex flex-col">
              {items.map((n, i) => (
                <li key={`${n.kind}-${n.href}-${i}`}>
                  <a href={n.href} className="flex gap-2 rounded-xl px-2 py-2 hover:bg-paper">
                    <span aria-hidden className="pt-0.5">{MARK[n.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13px]">{n.title}</b>
                      {n.body && (
                        <span className="block truncate text-[12px] text-muted">{n.body}</span>
                      )}
                      <span className="block text-[11px] text-muted">{ago(n.at)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
