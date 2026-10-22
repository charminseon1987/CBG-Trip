import Link from "next/link";
import type { CSSProperties } from "react";
import { store } from "@/lib/store";
import { currentUser } from "@/lib/auth";
import { getRegion } from "@/lib/regions";
import { visiblePhotos } from "@/lib/photos";
import { agentList } from "@/agents/registry";
import CatFace from "@/components/CatFace";
import NewTripForm from "@/components/NewTripForm";
import TripSearch from "@/components/TripSearch";

export const dynamic = "force-dynamic";

/* 테마마다 마스킹테이프·테마 칩 색이 다르다 — 앨범에서 한눈에 갈라 보인다 */
const THEME_COLOR: Record<string, string> = {
  가족: "var(--z-euro)",
  아이와: "var(--z-amer)",
  커플: "var(--rose)",
  친구: "var(--z-global)",
  혼자: "var(--z-magic)",
  액티비티: "var(--z-zoo)",
  휴양: "var(--z-show)",
};
const themeColor = (t: string) => THEME_COLOR[t] ?? "var(--z-euro)";

/* 사진이 아직 없는 앨범 표지에 놓는 그림 */
const THEME_ICON: Record<string, string> = {
  가족: "ri-group-line",
  아이와: "ri-emotion-happy-line",
  커플: "ri-heart-3-line",
  친구: "ri-team-line",
  혼자: "ri-user-3-line",
  액티비티: "ri-run-line",
  휴양: "ri-umbrella-line",
};

/* 앨범을 놓아 둔 것처럼 보이게 카드마다 살짝 다른 기울기 */
const TILTS = ["-1.6deg", "1.1deg", "-0.8deg", "1.7deg", "-1.2deg", "0.9deg"];

const span = (t: { date: string; end: string }) =>
  t.end && t.end !== t.date ? `${t.date} ~ ${t.end}` : t.date;

export default async function Home() {
  const me = await currentUser();
  const trips = await store.listTrips(me);
  const agents = agentList();
  /* 앨범 표지 — 그 여행에서 나에게 보이는 첫 사진. 사진은 올린 사람의 것이니
     보이는 범위가 다르면 표지도 다르다 */
  const covers = await Promise.all(
    trips.map((t) => visiblePhotos(t.id, me?.id ?? null).then((p) => p[0] ?? null)),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 pb-24">
      <div className="flex items-center gap-3.5">
        <CatFace who="logo" size={52} ring="border-brand" />
        <div>
          <p className="font-mono text-[12.5px] font-bold uppercase tracking-[0.18em] text-brand">
            Family trip log
          </p>
          <h1 className="mt-0.5 text-4xl font-extrabold tracking-tight">우리 여행 기록</h1>
        </div>
      </div>
      <p className="mt-3 max-w-2xl text-ink-2">
        여행 하나를 열면 <b>일정 · 앨범 · 가계부</b> 세 탭이 나옵니다. 탭마다 담당 냥이가
        챙기고, 말로 부탁하면 Chief가 알맞은 냥이에게 넘겨 줍니다.
      </p>

      <section className="mt-10 grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {trips.map((t, i) => {
          const pack = getRegion(t.region);
          const accent = themeColor(t.theme);
          const cover = covers[i];
          return (
            <Link
              key={t.id}
              href={`/trips/${t.id}`}
              className="album-card group block"
              style={{ "--tilt": TILTS[i % TILTS.length] } as CSSProperties}
            >
              <figure className="polaroid">
                <span
                  className="tape"
                  style={{
                    top: "-0.7rem", left: "50%",
                    transform: "translateX(-50%) rotate(-2deg)",
                    "--tape": accent,
                  } as CSSProperties}
                />
                {cover ? (
                  <img src={cover.url} alt={cover.caption || `${t.title} 사진`} loading="lazy" />
                ) : (
                  <div
                    className="grid aspect-square w-full place-content-center"
                    style={{
                      background: `radial-gradient(circle at 30% 25%, color-mix(in srgb, ${accent} 30%, white), color-mix(in srgb, ${accent} 12%, white) 70%)`,
                    }}
                  >
                    <i
                      className={`${THEME_ICON[t.theme] ?? "ri-image-line"} text-6xl`}
                      style={{ color: `color-mix(in srgb, ${accent} 75%, white)` }}
                      aria-hidden="true"
                    />
                  </div>
                )}
                <figcaption className="truncate">{t.title}</figcaption>
              </figure>
              <div className="mt-2.5 px-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <p className="flex items-center gap-1.5 text-sm text-ink-2">
                    <i className="ri-map-pin-2-line text-muted" aria-hidden="true" />
                    {t.place}
                  </p>
                  <p className="flex items-center gap-1 font-mono text-[11.5px] text-muted">
                    <i className="ri-calendar-line" aria-hidden="true" />
                    {span(t)}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-0.5 text-muted shadow-sm">
                    <i className="ri-group-line" aria-hidden="true" />
                    {t.people}명
                  </span>
                  <span
                    className="rounded-full px-2.5 py-0.5 font-bold"
                    style={{ background: `color-mix(in srgb, ${accent} 14%, white)`, color: accent }}
                  >
                    {t.theme}
                  </span>
                  {pack ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 font-bold text-brand">
                      <i className="ri-map-2-line" aria-hidden="true" />
                      {pack.mode === "drive" ? "차 이동" : "도보"} · {pack.pool.length}곳
                    </span>
                  ) : (
                    <span className="rounded-full bg-card px-2.5 py-0.5 text-muted shadow-sm">냥이가 짠 일정</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
        <NewTripForm />
      </section>

      {/* 초대 링크를 못 받은 사람도 들어올 길 — 주인이 켜 둔 여행만 찾힌다 */}
      <TripSearch />

      <section className="mt-12">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <CatFace who="chief" size={28} ring="border-brand" /> 냥이들
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border border-rule bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <CatFace who={a.id} size={40} />
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <p className="truncate font-bold">{a.name}</p>
                  {/* 무거운 생각이 필요한 일만 비싼 쪽으로 보낸다 — 모델 이름은 숨기고 등급만 보여 준다 */}
                  <span
                    className="chip shrink-0 text-[11px]"
                    style={{ color: a.tier === "default" ? "var(--z-magic)" : "var(--z-global)" }}
                  >
                    {a.tier === "default" ? "똑똑함" : "가벼움"}
                  </span>
                </div>
              </div>
              <p className="mt-2.5 text-[13px] leading-snug text-ink-2">{a.blurb}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
