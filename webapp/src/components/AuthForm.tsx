"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import CatFace from "./CatFace";
import { api } from "@/lib/api";

/** 로그인·첫 설정·가입은 모양이 거의 같아 한 컴포넌트로 쓴다. */
export default function AuthForm({
  mode, codeRequired = false, kakao = false, notice, next,
}: {
  mode: "login" | "setup" | "signup";
  /** setup 이면 SETUP_CODE, signup 이면 SIGNUP_CODE 를 받아야 하는가 */
  codeRequired?: boolean;
  /** 카카오 단추를 보일까. 키가 설정됐을 때만 참이다 */
  kakao?: boolean;
  /** 카카오에서 돌아오다 틀어졌을 때 그 까닭 */
  notice?: string;
  /** 들어간 뒤 갈 곳 */
  next?: string;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(notice ?? null);
  const [busy, setBusy] = useState(false);
  const setup = mode === "setup";
  const signup = mode === "signup";
  /* 계정을 새로 만드는 두 모드. 이름·비밀번호 확인을 함께 받는다 */
  const fresh = setup || signup;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    try {
      const body = fresh
        ? { email: f.get("email"), name: f.get("name"), password: f.get("password"),
            code: f.get("code") ?? "" }
        : { email: f.get("email"), password: f.get("password") };
      if (fresh && f.get("password") !== f.get("password2")) {
        throw new Error("비밀번호가 서로 다릅니다.");
      }
      await api(setup ? "/api/auth/setup" : signup ? "/api/auth/signup" : "/api/auth/login", {
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
          <h1 className="text-2xl font-bold">
            {setup ? "처음 오셨네요" : signup ? "계정 만들기" : "우리 여행 기록"}
          </h1>
        </div>
      </div>

      <p className="text-sm text-ink-2">
        {setup
          ? (codeRequired
              ? "관리자 계정을 만듭니다. 아무나 만들지 못하게 설정 코드를 함께 받습니다. 비밀번호는 서버에 해시로만 남습니다."
              : "쓸 사람이 아직 없습니다. 관리자 계정을 하나 만들어 주세요. 비밀번호는 서버에 해시로만 남고, 원문은 저장되지 않습니다.")
          : signup
            ? "메일 주소와 비밀번호로 계정을 만듭니다. 만들면 바로 들어갑니다. 초대받은 여행이 있어야 내용이 보입니다."
            : "메일 주소와 비밀번호로 들어갑니다."}
      </p>

      <form onSubmit={submit} className="flex flex-col gap-2">
        {fresh && codeRequired && (
          <label className="flex flex-col gap-1 text-sm">
            {setup ? "설정 코드" : "가입 코드"}
            <input name="code" required autoComplete="off" spellCheck={false}
              className="rounded-lg border border-rule bg-card px-3 py-2 font-mono" />
            <span className="text-xs text-muted">
              {setup
                ? "배포할 때 넣은 환경 변수 SETUP_CODE 의 값입니다."
                : "여행에 부른 사람에게 받은 코드입니다."}
            </span>
          </label>
        )}
        {fresh && (
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
          <input name="password" type="password" required minLength={fresh ? 10 : 1}
            autoComplete={fresh ? "new-password" : "current-password"}
            className="rounded-lg border border-rule bg-card px-3 py-2" />
        </label>
        {fresh && (
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
          {busy ? "확인하는 중…" : setup ? "관리자 계정 만들기" : signup ? "계정 만들고 들어가기" : "들어가기"}
        </button>
      </form>

      {/* 초대 링크를 따라왔는데 계정이 없는 사람이 여기서 막혔다.
          갈 곳(next)을 그대로 들고 간다 — 가입하면 그 초대장으로 돌아간다 */}
      {mode === "login" && (
        <p className="text-center text-sm text-muted">
          계정이 없으세요?{" "}
          <a href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-bold text-brand underline">계정 만들기</a>
        </p>
      )}
      {signup && (
        <p className="text-center text-sm text-muted">
          이미 계정이 있으세요?{" "}
          <a href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-bold text-brand underline">들어가기</a>
        </p>
      )}

      {/* 같이 간 사람을 초대하려면 그 사람이 들어올 수 있어야 한다.
          비밀번호를 새로 만들게 하면 대부분 거기서 그만둔다. */}
      {!setup && kakao && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-rule" />또는<span className="h-px flex-1 bg-rule" />
          </div>
          <a
            href={`/api/auth/kakao${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="btn flex items-center justify-center gap-2 py-2.5 font-bold"
            style={{ background: "#FEE500", color: "#191600", borderColor: "#FEE500" }}
          >
            카카오로 시작하기
          </a>
          <p className="-mt-1 text-xs text-muted">
            처음이면 계정이 새로 만들어집니다. 초대받은 여행이 있어야 내용이 보입니다.
          </p>
        </>
      )}
    </main>
  );
}
