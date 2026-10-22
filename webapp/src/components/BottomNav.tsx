"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import NoticeBell from "./NoticeBell";
import PasswordForm from "./PasswordForm";
import { TripForm } from "./NewTripForm";
import { alarmsEnabled, disableAlarms, enableAlarms } from "@/lib/alarms";
import { api } from "@/lib/api";
import type { Trip } from "@/lib/types";

/* 하단 탭 — 앱처럼 화면 아래에 뜬다.

   얹히는 곳은 "큰 화면" 뿐이다: 여행 목록(/)·대화·관리.
   로그인/가입/설정은 쓸 사람이 아직 없는 곳이라 숨기고,
   여행 상세(/trips/…)는 지도·대화창이 화면을 꽉 쓰니 제 내비를 둔다. */
const SHOW = ["/", "/chat", "/admin"];

function NavItem({
  href, icon, label, active,
}: {
  href: string; icon: string; label: string; active: boolean;
}) {
  return (
    <Link href={href}
      className={`flex flex-col items-center gap-0.5 px-4 py-1.5 transition-colors ${active ? "text-brand" : "text-muted hover:text-ink"}`}>
      <i className={`${icon} text-xl`} aria-hidden="true" />
      <span className="text-[10px] font-bold">{label}</span>
    </Link>
  );
}

/** 내 정보 — 이름·관리·비밀번호·로그아웃을 올려 띄운다 */
function AccountMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [pw, setPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alarm, setAlarm] = useState(false);
  const [alarmMsg, setAlarmMsg] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  /* 켜 둔 알림 스위치를 화면에 맞춘다 — 메뉴를 처음 열 때 읽는다 */
  useEffect(() => { setAlarm(alarmsEnabled()); }, []);

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
    /* 이름은 열 때만 물어온다 — 탭이 떠 있는 내내 물을 이유가 없다 */
    if (next && !me) {
      try {
        const d = await api<{ user: { name: string; role: string } | null }>("/api/auth/me");
        setMe(d.user);
      } catch { /* 넘긴다 */ }
    }
  }

  async function out() {
    setBusy(true);
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  /* 여행 알림 — 앱에서는 출발 전날 저녁·당일 아침 알람을 예약한다 */
  async function toggleAlarm() {
    setAlarmMsg(null);
    if (alarm) {
      await disableAlarms();
      setAlarm(false);
      return;
    }
    setBusy(true);
    try {
      const d = await api<{ trips: Trip[] }>("/api/trips");
      const msg = await enableAlarms(d.trips);
      if (msg) setAlarmMsg(msg);
      else setAlarm(true);
    } catch {
      setAlarmMsg("알림을 켜지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const item = "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper";

  return (
    <div ref={boxRef} className="relative">
      <button onClick={toggle} aria-expanded={open} aria-label="내 정보"
        className="flex flex-col items-center gap-0.5 px-4 py-1.5 text-muted transition-colors hover:text-ink">
        <i className="ri-user-3-line text-xl" aria-hidden="true" />
        <span className="text-[10px] font-bold">내 정보</span>
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-52 rounded-2xl border border-rule bg-card p-2 shadow-lg">
          <p className="truncate px-2 py-1.5 text-sm font-bold">
            {me?.name ?? "…"}
            {me?.role === "admin" && <span className="ml-1 text-xs font-bold text-brand">관리자</span>}
          </p>
          {me?.role === "admin" && (
            <Link href="/admin" onClick={() => setOpen(false)} className={item}>
              <i className="ri-settings-3-line" aria-hidden="true" /> 관리
            </Link>
          )}
          <button className={item} onClick={toggleAlarm} disabled={busy}>
            <i className="ri-alarm-line" aria-hidden="true" /> 여행 알림
            <span className={`ml-auto inline-block h-4 w-7 rounded-full transition-colors ${alarm ? "bg-z-zoo" : "bg-rule"}`}>
              <span className={`block h-4 w-4 rounded-full border border-rule bg-card transition-transform ${alarm ? "translate-x-3" : ""}`} />
            </span>
          </button>
          {alarmMsg && <p className="px-2 pb-1 text-xs font-bold text-brand">{alarmMsg}</p>}
          <button className={item} onClick={() => { setOpen(false); setPw(true); }}>
            <i className="ri-lock-line" aria-hidden="true" /> 비밀번호
          </button>
          <button className={`${item} disabled:opacity-50`} disabled={busy} onClick={out}>
            <i className="ri-logout-box-line" aria-hidden="true" /> 로그아웃
          </button>
        </div>
      )}
      {pw && <PasswordForm onClose={() => setPw(false)} />}
    </div>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);
  const show = SHOW.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
  if (!show) return null;

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 px-4 pt-2"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex w-full max-w-md items-center justify-around rounded-full border border-rule bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur">
          <NavItem href="/" icon="ri-home-5-line" label="홈" active={pathname === "/"} />
          <NavItem href="/chat" icon="ri-chat-3-line" label="대화" active={pathname.startsWith("/chat")} />
          <button aria-label="새 여행" onClick={() => setSheet(true)}
            className="-my-4 grid h-12 w-12 place-content-center rounded-full bg-brand text-2xl text-white shadow-lg shadow-brand/40 transition hover:scale-105 active:scale-95">
            <i className="ri-add-line" aria-hidden="true" />
          </button>
          <NoticeBell nav />
          <AccountMenu />
        </div>
      </nav>

      {/* 새 여행 — 바닥에서 올라오는 시트 */}
      {sheet && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="새 여행">
          <button aria-label="닫기" onClick={() => setSheet(false)}
            className="absolute inset-0 h-full w-full bg-ink/30" />
          <div className="sheet-in absolute inset-x-0 bottom-0 mx-auto w-full max-w-md rounded-t-3xl border border-rule bg-card p-5 pb-8 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-rule" />
            <h2 className="mb-3 text-lg font-bold">새 여행</h2>
            <TripForm onDone={() => setSheet(false)} />
          </div>
        </div>
      )}
    </>
  );
}
