import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentUser, userCount } from "@/lib/auth";
import { kakaoReady } from "@/lib/kakao";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign up",
  description: "Family Trip Log 계정을 만들고 우리 여행 기록을 시작합니다.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  /* 아무도 없으면 첫 관리자부터 — 가입으로 들여보내면 관리자 자리가 빈다 */
  const n = await userCount().catch(() => -1);
  if (n === 0) redirect("/setup");
  if (await currentUser()) redirect("/");

  const { next } = await searchParams;
  return (
    <AuthForm
      mode="signup"
      codeRequired={!!process.env.SIGNUP_CODE}
      kakao={kakaoReady()}
      next={next}
    />
  );
}
