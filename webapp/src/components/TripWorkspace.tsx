"use client";

import { useEffect, useState } from "react";
import LedgerBoard from "./LedgerBoard";
import ChiefDock from "./ChiefDock";
import PlanBoard, { type PlanPayload } from "./PlanBoard";
import PhotoBoard from "./PhotoBoard";
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
  { id: "album", label: "사진 · 일기" },
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
      <nav className="flex flex-none flex-wrap gap-1 border-b border-rule bg-card px-3 pb-2">
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
        {tab === "album" && <PhotoBoard trip={trip} />}
        {tab === "ledger" && <LedgerBoard trip={trip} />}
      </main>

      <ChiefDock tripId={trip.id} onChanged={reload} />
    </>
  );
}


