import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentUser, userCount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // 아직 아무도 없으면 설정부터
  const n = await userCount().catch(() => -1);
  if (n === 0) redirect("/setup");
  if (await currentUser()) redirect("/");
  return <AuthForm mode="login" />;
}
