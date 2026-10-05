import Link from "next/link";
import { store } from "@/lib/store";
import { currentUser } from "@/lib/auth";
import { getRegion } from "@/lib/regions";
import { agentList } from "@/agents/registry";
import { modelName, providerId } from "@/agents/provider";
import CatFace from "@/components/CatFace";
import UserMenu from "@/components/UserMenu";
import NewTripForm from "@/components/NewTripForm";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await currentUser();
  const trips = await store.listTrips(me);
  const agents = agentList();

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[12.5px] font-bold uppercase tracking-[0.18em] text-brand">
          Family trip log
        </p>
        <UserMenu user={me} />
      </div>
      <h1 className="mt-2 text-4xl font-extrabold tracking-tight">우리 여행 기록</h1>
      <p className="mt-3 max-w-2xl text-ink-2">
        여행 하나를 열면 <b>일정 · 앨범 · 가계부</b> 세 탭이 나옵니다. 각 탭은 담당 에이전트가
        맡고, 총괄 에이전트가 말로 받은 요청을 알맞은 쪽에 넘깁니다.
      </p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {trips.map((t) => {
          const pack = getRegion(t.region);
          return (
            <Link
              key={t.id}
              href={`/trips/${t.id}`}
              className="rounded-2xl border border-rule bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="font-mono text-xs text-muted">
                {t.date}
                {t.end && t.end !== t.date ? ` ~ ${t.end}` : ""}
              </p>
              <h2 className="mt-1 text-xl font-bold">{t.title}</h2>
              <p className="text-sm text-ink-2">{t.place}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-paper px-3 py-1 text-muted">{t.people}명</span>
                <span className="rounded-full bg-paper px-3 py-1 text-muted">{t.theme}</span>
                {pack ? (
                  <span className="rounded-full bg-brand-soft px-3 py-1 font-bold text-brand">
                    지도 {pack.mode === "drive" ? "· 차 이동" : "· 도보"} · {pack.pool.length}곳
                  </span>
                ) : (
                  <span className="rounded-full bg-paper px-3 py-1 text-muted">설계 에이전트</span>
                )}
              </div>
            </Link>
          );
        })}
        <NewTripForm />
      </section>

      <section className="mt-12">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <CatFace who="chief" size={28} ring="border-brand" /> 에이전트
        </h2>
        <p className="text-sm text-ink-2">
          총괄이 분류해 넘기고, 담당은 자기 도구만 씁니다.{" "}
          <span className="text-z-zoo">
            {providerId() === "ollama"
              ? `내 컴퓨터에서 실행 중 · Ollama ${modelName("quick")}`
              : `Anthropic ${modelName("quick")}`}
          </span>
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-rule bg-card">
          {agents.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule px-5 py-3 first:border-t-0"
            >
              <CatFace who={a.id} size={30} />
              <span className="w-12 font-bold">{a.name}</span>
              <span className="flex-1 text-sm text-ink-2">{a.blurb}</span>
              <span className="font-mono text-xs text-muted">{a.tier}</span>
              <span className="font-mono text-xs text-muted">{a.tools.join(" · ")}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
