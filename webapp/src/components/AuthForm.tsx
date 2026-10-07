"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import CatFace from "./CatFace";
import { api } from "@/lib/api";

/** 로그인과 첫 설정은 모양이 거의 같아 한 컴포넌트로 쓴다. */
export default function AuthForm({
  mode, codeRequired = false,
}: { mode: "login" | "setup"; codeRequired?: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setup = mode === "setup";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    try {
      const body = setup
        ? { email: f.get("email"), name: f.get("name"), password: f.get("password"),
            code: f.get("code") ?? "" }
        : { email: f.get("email"), password: f.get("password") };
      if (setup && f.get("password") !== f.get("password2")) {
        throw new Error("비밀번호가 서로 다릅니다.");
      }
      await api(setup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST", body: JSON.stringify(body),
      });
      const next = new URLSearchParams(location.search).get("next") || "/";
      router.replace(next);
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-5 px-6">
      <div className="flex items-center gap-3">
        <CatFace who="chief" size={54} ring="border-brand" className="border-[3px]" />
        <div>
          <p className="font-mono text-[12.5px] font-bold uppercase tracking-[0.18em] text-brand">
            Family trip log
          </p>
          <h1 className="text-2xl font-bold">{setup ? "처음 오셨네요" : "우리 여행 기록"}</h1>
        </div>
      </div>

      <p className="text-sm text-ink-2">
        {setup
          ? (codeRequired
              ? "관리자 계정을 만듭니다. 아무나 만들지 못하게 설정 코드를 함께 받습니다. 비밀번호는 서버에 해시로만 남습니다."
              : "쓸 사람이 아직 없습니다. 관리자 계정을 하나 만들어 주세요. 비밀번호는 서버에 해시로만 남고, 원문은 저장되지 않습니다.")
          : "메일 주소와 비밀번호로 들어갑니다."}
      </p>

      <form onSubmit={submit} className="flex flex-col gap-2">
        {setup && codeRequired && (
          <label className="flex flex-col gap-1 text-sm">
            설정 코드
            <input name="code" required autoComplete="off" spellCheck={false}
              className="rounded-lg border border-rule bg-card px-3 py-2 font-mono" />
            <span className="text-xs text-muted">
              배포할 때 넣은 환경 변수 SETUP_CODE 의 값입니다.
            </span>
          </label>
        )}
        {setup && (
          <label className="flex flex-col gap-1 text-sm">
            이름
            <input name="name" required maxLength={40} autoComplete="name"
              className="rounded-lg border border-rule bg-card px-3 py-2" />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          메일 주소
          <input name="email" type="email" required autoComplete="username"
            className="rounded-lg border border-rule bg-card px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          비밀번호
          <input name="password" type="password" required minLength={setup ? 10 : 1}
            autoComplete={setup ? "new-password" : "current-password"}
            className="rounded-lg border border-rule bg-card px-3 py-2" />
        </label>
        {setup && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              비밀번호 확인
              <input name="password2" type="password" required minLength={10}
                autoComplete="new-password"
                className="rounded-lg border border-rule bg-card px-3 py-2" />
            </label>
            <p className="text-xs text-muted">10자 이상. 길수록 좋습니다.</p>
          </>
        )}

        {err && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-bold text-brand">{err}</p>}

        <button disabled={busy} className="btn btn-primary mt-2 py-2.5">
          {busy ? "확인하는 중…" : setup ? "관리자 계정 만들기" : "들어가기"}
        </button>
      </form>
    </main>
  );
}
