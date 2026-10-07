import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { userCount } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* 관리자는 설정 코드를 아는 사람만 만든다 — 공개 주소에서 선착순이 되지 않게.
   코드도 없고 개발 중도 아니면 아예 잠근다. 자세한 사정은 api/auth/setup/route.ts */
const CODE = process.env.SETUP_CODE || "";
const LOCAL = process.env.NODE_ENV !== "production";

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

  if (!CODE && !LOCAL) {
    return (
      <main className="mx-auto max-w-md px-6 py-20">
        <h1 className="text-xl font-bold">설정이 잠겨 있습니다</h1>
        <p className="mt-2 text-ink-2">
          관리자 계정을 아무나 만들지 못하게, 설정 코드가 있어야 만들 수 있습니다.
          환경 변수 <code>SETUP_CODE</code> 를 넣고 다시 배포해 주세요.
        </p>
      </main>
    );
  }

  return <AuthForm mode="setup" codeRequired={Boolean(CODE)} />;
}
