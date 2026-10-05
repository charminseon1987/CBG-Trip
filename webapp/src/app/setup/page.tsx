import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { userCount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const n = await userCount().catch(() => -1);
  if (n === -1) {
    return (
      <main className="mx-auto max-w-md px-6 py-20">
        <h1 className="text-xl font-bold">DB 가 연결되지 않았습니다</h1>
        <p className="mt-2 text-ink-2">
          <code>.env.local</code> 에 <code>DATABASE_URL</code> 을 넣고 서버를 다시 켜 주세요.
        </p>
      </main>
    );
  }
  if (n > 0) redirect("/login");
  return <AuthForm mode="setup" />;
}
