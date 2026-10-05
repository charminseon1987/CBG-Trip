import Link from "next/link";
import { redirect } from "next/navigation";
import AdminUsers from "@/components/AdminUsers";
import CatFace from "@/components/CatFace";
import { currentUser, listUsers } from "@/lib/auth";
import { storeKind } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await currentUser();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "admin") {
    return (
      <main className="mx-auto max-w-md px-6 py-20">
        <h1 className="text-xl font-bold">권한이 없습니다</h1>
        <p className="mt-2 text-ink-2">관리자만 볼 수 있는 화면입니다.</p>
        <Link href="/" className="btn mt-4 inline-flex">여행 목록으로</Link>
      </main>
    );
  }

  const users = await listUsers();

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10">
      <div className="flex items-center gap-3">
        <CatFace who="chief" size={44} ring="border-brand" />
        <div>
          <p className="font-mono text-[12.5px] font-bold uppercase tracking-[0.18em] text-brand">
            Admin
          </p>
          <h1 className="text-2xl font-bold">관리</h1>
        </div>
        <Link href="/" className="btn ml-auto">여행 목록</Link>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact k="사용자" v={`${users.length}명`} />
        <Fact k="관리자" v={`${users.filter((u) => u.role === "admin").length}명`} />
        <Fact k="저장소" v={storeKind()} />
        <Fact k="나" v={me.name} />
      </dl>

      <AdminUsers initial={users} meId={me.id} />

      <section className="mt-10 rounded-xl border border-rule bg-card p-4 text-sm text-ink-2">
        <h2 className="font-bold text-ink">알아 두실 것</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          <li>비밀번호는 scrypt 해시로만 저장됩니다. 원문은 서버에도 남지 않아 <b>복구할 수 없고</b>, 잊으면 여기서 재설정해 주셔야 합니다.</li>
          <li>비밀번호를 바꾸면 그 사람의 <b>모든 기기에서 로그아웃</b>됩니다.</li>
          <li>사용자를 지우면 그 사람의 여행·일정·사진·지출이 <b>같이 지워집니다</b>.</li>
          <li>관리자가 한 명뿐일 때는 그 계정의 권한을 내리거나 지울 수 없습니다 — 아무도 못 들어가게 되기 때문입니다.</li>
        </ul>
      </section>
    </main>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-xl bg-card px-3 py-2 shadow-sm">
    <dt className="text-[11.5px] uppercase tracking-wide text-muted">{k}</dt>
    <dd className="font-mono text-base font-bold">{v}</dd>
  </div>
);
