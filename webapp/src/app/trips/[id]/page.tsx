import Link from "next/link";
import { notFound } from "next/navigation";
import CatFace from "@/components/CatFace";
import TripWorkspace from "@/components/TripWorkspace";
import { getRegion } from "@/lib/regions";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await store.getTrip(id);
  if (!trip) notFound();

  const pack = getRegion(trip.region);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex flex-none items-center gap-4 border-b border-rule bg-card px-4 py-2">
        <Link href="/" aria-label="여행 목록"
          className="grid h-8 w-8 place-content-center rounded-lg border border-rule">←</Link>
        <CatFace who="logo" size={34} ring="border-brand" />
        <div className="min-w-0 leading-tight">
          <b className="block truncate">{trip.title}</b>
          <span className="block truncate font-mono text-[11px] text-muted">
            {trip.date} · {trip.place} · {trip.people}명
          </span>
        </div>
      </header>

      <TripWorkspace
        trip={trip}
        /* 지도 바탕과 좌표계만 넘긴다. 노드·간선은 서버가 쥐고 있고,
           계산 결과는 /api/trips/:id/plan 으로 받는다. */
        map={pack ? { key: pack.key, vw: pack.vw, vh: pack.vh, base: pack.base, source: pack.source } : null}
      />
    </div>
  );
}
