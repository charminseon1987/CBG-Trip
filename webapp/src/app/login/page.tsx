import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentUser, userCount } from "@/lib/auth";
import { kakaoReady } from "@/lib/kakao";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; next?: string }>;
}) {
  // 아직 아무도 없으면 설정부터
  const n = await userCount().catch(() => -1);
  if (n === 0) redirect("/setup");
  if (await currentUser()) redirect("/");

  /* 카카오에서 돌아오다 틀어지면 ?err= 에 까닭이 실려 온다 */
  const { err, next } = await searchParams;
  return <AuthForm mode="login" kakao={kakaoReady()} notice={err} next={next} />;
}
