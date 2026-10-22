"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

/* 하단 탭의 종. 누르면 앱처럼 바닥 시트가 올라와 알림 목록을 보여 준다 —
   들어온 신청 · 내 신청 결과 · 안 읽은 말.
   볼 게 하나도 없으면 시트 대신 플랫폼 토스트(.sheet)를 잠깐 띄운다.

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

const MARK: Record<Notice["kind"], { icon: string; cls: string }> = {
  join_request: { icon: "ri-door-open-line", cls: "bg-brand-soft text-brand" },
  join_result: { icon: "ri-checkbox-circle-line", cls: "bg-z-zoo/10 text-z-zoo" },
  chat: { icon: "ri-chat-3-line", cls: "bg-z-global/10 text-z-global" },
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

export default function NoticeBell({ nav = false }: { nav?: boolean }) {
  const [badge, setBadge] = useState(0);
  const [items, setItems] = useState<Notice[] | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(false);

  /* 최신 목록을 돌려준다 — 시트를 열지 토스트를 띄울지 그 자리에서 정해야 해서 */
  const load = useCallback(async (): Promise<Notice[]> => {
    try {
      const d = await api<{ items: Notice[]; badge: number }>("/api/notices");
      setItems(d.items);
      setBadge(d.badge);
      return d.items;
    } catch {
      /* 종이 안 떠도 앱은 돈다 — 마지막으로 아는 목록을 넘긴다 */
      return items ?? [];
    }
  }, [items]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  /* 토스트는 잠깐만 띄운다 */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  async function tap() {
    if (open) { setOpen(false); return; }
    const list = await load();
    if (list.length === 0) {
      setToast(true);
      return;
    }
    setOpen(true);
    /* 열었으면 "여기까지 봤다". 신청은 이걸로 안 사라진다 — 처리해야 사라진다 */
    try {
      await api("/api/notices/seen", { method: "POST" });
      await load();
    } catch { /* 넘긴다 */ }
  }

  /* 하단 탭에 얹힐 때는 아이콘+뱃지, 머리글에 얹힐 때는 글자 단추 */
  const trigger = nav
    ? "relative flex flex-col items-center gap-0.5 px-4 py-1.5 text-muted"
    : "btn";

  return (
    <>
      <button
        className={trigger}
        aria-label={badge ? `알림 ${badge}개` : "알림"}
        aria-expanded={open}
        onClick={tap}
      >
        {nav ? (
          <>
            <i className="ri-notification-3-line text-xl" aria-hidden="true" />
            <span className="text-[10px] font-bold">알림</span>
            {badge > 0 && (
              <span className="absolute right-1.5 top-0 rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </>
        ) : (
          <>
            알림
            {badge > 0 && (
              <span className="ml-1 rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </>
        )}
      </button>

      {/* 알림 목록 — "새 여행" 과 같은 바닥 시트 */}
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="알림">
          <button aria-label="닫기" onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full bg-ink/30" />
          <div className="sheet-in absolute inset-x-0 bottom-0 mx-auto w-full max-w-md rounded-t-3xl border border-rule bg-card p-5 pb-8 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-rule" />
            <h2 className="mb-1 text-lg font-bold">알림</h2>
            <ul className="max-h-[60vh] divide-y divide-rule/70 overflow-y-auto">
              {(items ?? []).map((n, i) => (
                <li key={`${n.kind}-${n.href}-${i}`}>
                  <a href={n.href} onClick={() => setOpen(false)}
                    className="flex items-center gap-3 py-3 transition-colors">
                    <span className={`grid h-9 w-9 shrink-0 place-content-center rounded-full text-lg ${MARK[n.kind].cls}`}>
                      <i className={MARK[n.kind].icon} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm">{n.title}</b>
                      {n.body && (
                        <span className="block truncate text-xs text-muted">{n.body}</span>
                      )}
                      <span className="block text-[11px] text-muted">{ago(n.at)}</span>
                    </span>
                    {n.count > 1 && (
                      <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
                        {n.count}
                      </span>
                    )}
                    <i className="ri-arrow-right-s-line shrink-0 text-muted" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 볼 게 없을 때 — 플랫폼 토스트 */}
      {toast && (
        <div className="sheet flex items-center gap-2 text-sm" role="status">
          <i className="ri-notification-3-line text-lg text-brand" aria-hidden="true" />
          새로 볼 알림이 없습니다.
        </div>
      )}
    </>
  );
}
