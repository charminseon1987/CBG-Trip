"use client";

import { useEffect, useState } from "react";
import CatFace from "./CatFace";
import ChiefDock from "./ChiefDock";
import PlanBoard, { type PlanPayload } from "./PlanBoard";
import { api } from "@/lib/api";
import type { Trip } from "@/lib/types";

export interface MapInfo {
  key: string;
  vw: number;
  vh: number;
  base: string;
  source: string;
}

const TABS = [
  { id: "plan", label: "일정" },
  { id: "album", label: "앨범 · 사진" },
  { id: "ledger", label: "가계부" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function TripWorkspace({ trip, map }: { trip: Trip; map: MapInfo | null }) {
  const [tab, setTab] = useState<TabId>("plan");
  const [plan, setPlan] = useState<PlanPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = async () => {
    try {
      setPlan(await api<PlanPayload>(`/api/trips/${trip.id}/plan`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  return (
    <>
      <nav className="flex flex-none gap-1 border-b border-rule bg-card px-4 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-selected={tab === t.id}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              tab === t.id ? "bg-brand font-bold text-white" : "text-muted hover:bg-paper"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === "plan" && (
          <PlanBoard trip={trip} map={map} plan={plan} error={err} onChanged={reload} />
        )}
        {tab === "album" && (
          <Placeholder
            cat="stretch"
            title="앨범 · 사진"
            body="사진은 찍힌 시각으로 일정 블록에 자동 분류됩니다. 업로드는 스토리지를 붙인 뒤 열립니다 — 지금은 REST(POST /api/trips/:id/photos)로 URL 을 넣을 수 있습니다."
          />
        )}
        {tab === "ledger" && (
          <Placeholder
            cat="sleep"
            title="가계부"
            body="입장권 · 차량유지비 · 식비 · 간식 · 기념품 · 기타 여섯 분류로 적습니다. 회계 에이전트에게 말로 적어 달라고 해도 됩니다 — 아래 냥이 버튼을 누르세요."
          />
        )}
      </main>

      <ChiefDock tripId={trip.id} onChanged={reload} />
    </>
  );
}

function Placeholder({ cat, title, body }: { cat: string; title: string; body: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-6 py-12 text-center">
      <CatFace who={cat} size={120} ring="border-brand" className="border-[3px]" />
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="text-ink-2">{body}</p>
    </div>
  );
}
