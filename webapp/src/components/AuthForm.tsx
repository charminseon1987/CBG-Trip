"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import CatFace from "./CatFace";
import Loader from "./Loader";
import { api } from "@/lib/api";

/* 가입 때 보이는 약관. 고칠 때는 서버에도 저장되는 동의 기록(consents)과
   함께 생각한다 — 내용이 바뀌면 예전 동의와 다른 약관이 된다. */
const TERMS_TEXT = `1. 이 서비스는 가족·지인과 여행 일정·사진·지출·일기를 함께 기록하는 도구입니다.
2. 내가 올린 사진·일정·지출은 나와 내가 초대한 여행 멤버에게만 공개됩니다. 여행의 "검색 노출"을 켜면 제목·지역·날짜·인원만 검색 결과에 보입니다.
3. 다른 사람의 계정이나 자료를 침해하거나 서비스 운영을 방해하면 이용을 제한할 수 있습니다.
4. 서비스는 있는 그대로 제공됩니다. 운영 정책이 바뀌면 앱 안에 알립니다.`;

const PRIVACY_TEXT = `수집 항목: 메일 주소, 이름, 비밀번호(해시로만 저장), 서비스에서 만든 기록(일정·사진·지출·일기·대화). 카카오로 들어오면 카카오 회원번호도 받습니다.
이용 목적: 로그인과 본인 확인, 여행 멤버와의 공유, 알림 표시.
보관 기간: 계정을 지울 때까지. 지우면 함께 삭제됩니다.
동의를 거부할 권리가 있습니다. 다만 필수 항목에 동의하지 않으면 가입할 수 없습니다.`;

const MARKETING_TEXT = `새 기능 소식, 여행 팁 같은 소식을 앱 알림으로 보냅니다.
동의하지 않아도 서비스는 그대로 쓸 수 있고, 언제든 마음을 바꿀 수 있습니다.`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 한 칸의 검사. blur 와 전송 둘 다 이걸 쓴다 — 결과가 같아야 헷갈리지 않는다 */
function checkField(k: string, v: Record<string, string>, fresh: boolean): string {
  switch (k) {
    case "email":
      if (!v.email.trim()) return "메일 주소를 입력해 주세요.";
      if (!EMAIL_RE.test(v.email.trim())) return "메일 주소 형식이 아닙니다.";
      return "";
    case "name":
      return fresh && !v.name.trim() ? "이름을 입력해 주세요." : "";
    case "password":
      /* 아래 조건표와 같은 규칙이다 — lib/auth.ts 의 checkPasswordStrength 와 맞춘다 */
      if (!v.password) return "비밀번호를 입력해 주세요.";
      if (fresh) {
        if (v.password.length < 10) return "비밀번호는 10자 이상이어야 합니다.";
        if (/^\d+$/.test(v.password)) return "숫자만으로는 안 됩니다.";
        if (/^(.)\1+$/.test(v.password)) return "같은 글자만 반복할 수 없습니다.";
      }
      return "";
    case "password2":
      return fresh && v.password !== v.password2 ? "비밀번호가 서로 다릅니다." : "";
    default:
      return "";
  }
}

/** 체크 상자 — 진짜 input 은 숨기고(peer) 이게 대신 그려진다 */
function Tick() {
  return (
    <span aria-hidden="true"
      className="grid h-5 w-5 shrink-0 place-content-center rounded-md border-2 border-rule bg-card text-transparent transition-colors peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-soft">
      <i className="ri-check-line text-[13px] leading-none" aria-hidden="true" />
    </span>
  );
}

/** 약관 한 줄 — 왼쪽 상자가 동의, 오른쪽 화살표가 내용을 펼친다 */
function ConsentRow({
  required, title, detail, checked, onChange,
}: {
  required: boolean;
  title: string;
  detail: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-1">
        <label className="flex flex-1 cursor-pointer items-center gap-2.5 py-1">
          <input type="checkbox" checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="peer sr-only" />
          <Tick />
          <span className="text-sm">
            <b className={required ? "text-brand" : "text-muted"}>
              {required ? "필수" : "선택"}
            </b>{" "}
            {title}
          </span>
        </label>
        <button type="button" onClick={() => setOpen((o) => !o)}
          aria-expanded={open} aria-label={`${title} 내용 ${open ? "닫기" : "보기"}`}
          className="grid h-7 w-7 shrink-0 place-content-center rounded-full text-muted transition-colors hover:bg-brand-soft hover:text-brand">
          <i className={`ri-arrow-down-s-line text-xl transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>
      <div className={`grid transition-all duration-200 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <p className="ml-[1.9rem] mt-1 whitespace-pre-line rounded-lg bg-paper p-2.5 text-xs leading-relaxed text-ink-2">
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}

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
  /* 로그인은 됐고 다음 화면을 불러오는 중 — 이 사이에 화면이 멈춘 것처럼 보여서
     "여는 중" 을 띄운다 */
  const [opening, setOpening] = useState(false);
  /* 비밀번호와 확인 칸의 보기는 따로 누른다 — 하나로 묶으면 한쪽만 보고 싶을 때 못 한다 */
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  /* 칸별 검사 결과 — 어디가 틀렸는지 그 칸 밑에 바로 띄운다 */
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  /* 칸에 적힌 값 — 쓰는 동안 조건표가 살아 움직이게 하려고 따라 적는다 */
  const [v, setV] = useState({ email: "", name: "", password: "", password2: "" });
  /* 가입 동의 — 필수 둘이 켜져야 보낸다 */
  const [consent, setConsent] = useState({ terms: false, privacy: false, marketing: false });
  const setup = mode === "setup";
  const signup = mode === "signup";
  /* 계정을 새로 만드는 두 모드. 이름·비밀번호 확인을 함께 받는다 */
  const fresh = setup || signup;

  const onField = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV((p) => ({ ...p, [k]: e.target.value }));
    setFieldErr((p) => (p[k] ? { ...p, [k]: "" } : p));
  };

  /* 칸을 떠날 때 그 칸만 검사한다 — 다 쓰기 전에 미리 알려 준다 */
  const onBlur = (k: keyof typeof v) => () => {
    const msg = checkField(k, v, fresh);
    if (msg) setFieldErr((p) => ({ ...p, [k]: msg }));
  };

  const toggleConsent = (k: keyof typeof consent) => (yes: boolean) => {
    setConsent((p) => ({ ...p, [k]: yes }));
    setFieldErr((p) => (p.consent ? { ...p, consent: "" } : p));
  };

  const allConsent = consent.terms && consent.privacy && consent.marketing;

  /* 비밀번호 조건표 — 쓰는 동안 채워진다. checkField("password") 와 같은 규칙 */
  const pwRules = [
    { ok: v.password.length >= 10, label: "10자 이상" },
    { ok: v.password.length > 0 && !/^\d+$/.test(v.password), label: "숫자만은 안 됩니다" },
    { ok: v.password.length > 0 && !/^(.)\1+$/.test(v.password), label: "같은 글자만 반복할 수 없습니다" },
  ];
  const emailOk = EMAIL_RE.test(v.email.trim());

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErr(null);

    /* 서버까지 안 가도 되는 틀림은 여기서 칸마다 알린다 */
    const vals = {
      email: String(f.get("email") ?? ""),
      name: String(f.get("name") ?? ""),
      password: String(f.get("password") ?? ""),
      password2: String(f.get("password2") ?? ""),
    };
    const errs: Record<string, string> = {};
    for (const k of ["name", "email", "password", "password2"] as const) {
      const msg = checkField(k, vals, fresh);
      if (msg) errs[k] = msg;
    }
    if (signup && (!consent.terms || !consent.privacy)) {
      errs.consent = "필수 약관에 동의해 주세요.";
    }
    if (Object.keys(errs).length) { setFieldErr(errs); return; }
    setFieldErr({});

    setBusy(true);
    try {
      const email = vals.email.trim();
      const body = fresh
        ? { email, name: vals.name.trim(), password: vals.password,
            code: f.get("code") ?? "", ...(signup ? { consent } : {}) }
        : { email, password: vals.password };
      await api(setup ? "/api/auth/setup" : signup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST", body: JSON.stringify(body),
      });
      const next = new URLSearchParams(location.search).get("next") || "/";
      setOpening(true);
      /* 로그인 전에 캐시된 화면(리다이렉트·로그인 페이지)을 먼저 비운 뒤 간다 —
         뒤로 가기/캐시에서 낡은 화면이 다시 나오는 걸 막는다 */
      router.refresh();
      router.replace(next);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <main className="page-in mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-5 px-6">
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
            : "일정·사진·가계부까지 냥이가 곁에서 챙겨 드려요."}
      </p>

      <form onSubmit={submit} noValidate className="flex flex-col gap-2">
        {fresh && codeRequired && (
          <label className="flex flex-col gap-1 text-sm">
            {setup ? "설정 코드" : "가입 코드"}
            <input name="code" required autoComplete="off" spellCheck={false}
              placeholder="코드 입력"
              className="rounded-lg border border-rule bg-card px-3 py-2 font-mono" />
            <span className="text-xs text-muted">
              {setup
                ? "배포할 때 넣은 환경 변수 SETUP_CODE 의 값입니다."
                : "여행에 부른 사람에게 받은 코드입니다."}
            </span>
          </label>
        )}
        {fresh && (
          <div className="flex flex-col gap-1 text-sm">
            <span>이름</span>
            <input name="name" required maxLength={40} autoComplete="name"
              placeholder="이름"
              onChange={onField("name")} onBlur={onBlur("name")}
              aria-invalid={Boolean(fieldErr.name)}
              className={`rounded-lg border bg-card px-3 py-2 ${fieldErr.name ? "border-brand" : "border-rule"}`} />
            {fieldErr.name && <p className="text-xs font-bold text-brand">{fieldErr.name}</p>}
          </div>
        )}
        <div className="flex flex-col gap-1 text-sm">
          <span>메일 주소</span>
          <div className="relative">
            <input name="email" type="email" required autoComplete="username"
              placeholder="name@example.com"
              onChange={onField("email")} onBlur={onBlur("email")}
              aria-invalid={Boolean(fieldErr.email)}
              className={`w-full rounded-lg border bg-card px-3 py-2 pr-9 ${fieldErr.email ? "border-brand" : "border-rule"}`} />
            {emailOk && !fieldErr.email && (
              <i className="ri-checkbox-circle-fill pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-z-zoo" aria-hidden="true" />
            )}
          </div>
          {fieldErr.email && <p className="text-xs font-bold text-brand">{fieldErr.email}</p>}
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <span>비밀번호</span>
          <div className="relative">
            <input name="password" type={showPw ? "text" : "password"} required
              minLength={fresh ? 10 : 1}
              autoComplete={fresh ? "new-password" : "current-password"}
              placeholder="비밀번호"
              onChange={onField("password")} onBlur={onBlur("password")}
              aria-invalid={Boolean(fieldErr.password)}
              className={`w-full rounded-lg border bg-card px-3 py-2 pr-11 ${fieldErr.password ? "border-brand" : "border-rule"}`} />
            <button type="button" onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
              aria-pressed={showPw}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-lg text-muted hover:text-ink">
              <i className={showPw ? "ri-eye-off-line" : "ri-eye-line"} aria-hidden="true" />
            </button>
          </div>
          {fieldErr.password && <p className="text-xs font-bold text-brand">{fieldErr.password}</p>}
          {fresh && (
            <ul className="flex flex-col gap-0.5 pt-0.5">
              {pwRules.map((r) => (
                <li key={r.label}
                  className={`flex items-center gap-1 text-xs ${r.ok ? "font-bold text-z-zoo" : "text-muted"}`}>
                  <i className={r.ok ? "ri-checkbox-circle-fill" : "ri-checkbox-blank-circle-line"} aria-hidden="true" />
                  {r.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        {fresh && (
          <div className="flex flex-col gap-1 text-sm">
            <span>비밀번호 확인</span>
            <div className="relative">
              <input name="password2" type={showPw2 ? "text" : "password"} required minLength={10}
                autoComplete="new-password"
                placeholder="비밀번호 다시 입력"
                onChange={onField("password2")} onBlur={onBlur("password2")}
                aria-invalid={Boolean(fieldErr.password2)}
                className={`w-full rounded-lg border bg-card px-3 py-2 pr-11 ${fieldErr.password2 ? "border-brand" : "border-rule"}`} />
              <button type="button" onClick={() => setShowPw2((v) => !v)}
                aria-label={showPw2 ? "비밀번호 숨기기" : "비밀번호 보기"}
                aria-pressed={showPw2}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-lg text-muted hover:text-ink">
                <i className={showPw2 ? "ri-eye-off-line" : "ri-eye-line"} aria-hidden="true" />
              </button>
            </div>
            {fieldErr.password2
              ? <p className="text-xs font-bold text-brand">{fieldErr.password2}</p>
              : v.password2 && (
                <p className={`flex items-center gap-1 text-xs font-bold ${v.password === v.password2 ? "text-z-zoo" : "text-brand"}`}>
                  <i className={v.password === v.password2 ? "ri-checkbox-circle-fill" : "ri-close-circle-fill"} aria-hidden="true" />
                  {v.password === v.password2 ? "비밀번호가 같습니다" : "비밀번호가 서로 다릅니다"}
                </p>
              )}
          </div>
        )}

        {signup && (
          <div className={`mt-1 flex flex-col gap-1.5 rounded-xl border bg-card p-3.5 ${fieldErr.consent ? "border-brand" : "border-rule"}`}>
            <label className="flex cursor-pointer items-center gap-2.5 py-1">
              <input type="checkbox" checked={allConsent}
                onChange={(e) => {
                  const yes = e.target.checked;
                  setConsent({ terms: yes, privacy: yes, marketing: yes });
                  setFieldErr((p) => (p.consent ? { ...p, consent: "" } : p));
                }}
                className="peer sr-only" />
              <Tick />
              <span className="text-sm font-bold">약관에 모두 동의합니다</span>
            </label>
            <hr className="border-rule" />
            <ConsentRow required title="서비스 이용약관" detail={TERMS_TEXT}
              checked={consent.terms} onChange={toggleConsent("terms")} />
            <ConsentRow required title="개인정보 수집·이용 동의" detail={PRIVACY_TEXT}
              checked={consent.privacy} onChange={toggleConsent("privacy")} />
            <ConsentRow required={false} title="여행 소식·알림 받기" detail={MARKETING_TEXT}
              checked={consent.marketing} onChange={toggleConsent("marketing")} />
            {fieldErr.consent && <p className="text-xs font-bold text-brand">{fieldErr.consent}</p>}
          </div>
        )}

        {err && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-bold text-brand">{err}</p>}

        <button disabled={busy || opening} className="btn btn-primary mt-2 py-2.5">
          {opening ? "기록장을 여는 중…" : busy ? "확인하는 중…" : setup ? "관리자 계정 만들기" : signup ? "계정 만들고 기록하기" : "기록하기"}
        </button>
      </form>

      {/* 성공 직후 다음 화면을 기다리는 동안 — 아무 반응이 없으면 안 눌린 줄 안다 */}
      {opening && (
        <div className="fixed inset-0 z-50 grid place-content-center bg-paper/80 backdrop-blur-sm">
          <div className="page-in rounded-3xl bg-card px-8 py-4 shadow-lg">
            <Loader note="기록장을 여는 중…" className="py-2" />
          </div>
        </div>
      )}

      {/* 초대 링크를 따라왔는데 계정이 없는 사람이 여기서 막혔다.
          갈 곳(next)을 그대로 들고 간다 — 가입하면 그 초대장으로 돌아간다 */}
      {mode === "login" && (
        <p className="text-center text-sm text-muted">
          계정이 없으세요?{" "}
          <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-bold text-brand underline">계정 만들기</Link>
        </p>
      )}
      {signup && (
        <p className="text-center text-sm text-muted">
          이미 계정이 있으세요?{" "}
          <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-bold text-brand underline">로그인</Link>
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
