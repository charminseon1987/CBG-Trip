"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/* 자기 비밀번호를 바꾸는 작은 창. UserMenu 가 연다.

   규칙은 서버(lib/auth.ts 의 checkPasswordStrength)가 진짜로 검사한다.
   여기 적힌 것은 안내일 뿐이다 — 두 군데가 엇갈리면 서버 쪽이 맞다. */
export default function PasswordForm({ onClose }: { onClose: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const next = String(f.get("next") ?? "");
    setBusy(true); setErr(null);
    try {
      if (next !== String(f.get("next2") ?? "")) throw new Error("새 비밀번호가 서로 다릅니다.");
      await api("/api/auth/password", {
        method: "PUT",
        body: JSON.stringify({ current: f.get("current"), next }),
      });
      setDone(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-ink/45 p-4 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label="비밀번호 바꾸기"
      onClick={onClose}
    >
      <div
        className="w-[min(26rem,100%)] rounded-2xl border border-rule bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">비밀번호 바꾸기</h2>

        {done ? (
          <>
            <p className="mt-2 text-sm text-ink-2">
              바꿨습니다. 다른 기기에서는 로그아웃됐고, 이 기기는 그대로 있습니다.
            </p>
            <button className="btn btn-primary mt-4 w-full py-2.5" onClick={onClose}>닫기</button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-2">
              바꾸면 다른 기기에서는 모두 로그아웃됩니다. 이 기기는 그대로 둡니다.
            </p>

            <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-sm">
                지금 비밀번호
                <input name="current" type="password" required autoComplete="current-password"
                  className="rounded-lg border border-rule bg-card px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                새 비밀번호
                <input name="next" type="password" required minLength={10} autoComplete="new-password"
                  className="rounded-lg border border-rule bg-card px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                새 비밀번호 확인
                <input name="next2" type="password" required minLength={10} autoComplete="new-password"
                  className="rounded-lg border border-rule bg-card px-3 py-2" />
              </label>
              <p className="text-xs text-muted">
                10자 이상. 숫자만은 안 되고, 흔한 말은 못 씁니다. 길수록 좋습니다.
              </p>

              {err && (
                <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-bold text-brand">{err}</p>
              )}

              <div className="mt-2 flex gap-2">
                <button type="button" className="btn flex-1 py-2.5" onClick={onClose}>그만두기</button>
                <button disabled={busy} className="btn btn-primary flex-1 py-2.5">
                  {busy ? "바꾸는 중…" : "바꾸기"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
