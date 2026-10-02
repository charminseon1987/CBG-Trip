"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Trip } from "@/lib/types";

const THEMES = ["가족", "아이와", "커플", "친구", "혼자", "액티비티", "휴양"];

export default function NewTripForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    try {
      const { trip } = await api<{ trip: Trip }>("/api/trips", {
        method: "POST",
        body: JSON.stringify({
          title: String(f.get("title") || "새 여행"),
          date: String(f.get("date")),
          end: String(f.get("end") || f.get("date")),
          place: String(f.get("place") || ""),
          people: Number(f.get("people") || 1),
          theme: String(f.get("theme") || "가족"),
        }),
      });
      router.push(`/trips/${trip.id}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "실패했습니다.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-2xl border border-dashed border-brand/50 bg-card/60 p-5 text-center font-bold text-brand transition hover:bg-brand-soft"
      >
        + 새 여행
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-rule bg-card p-5 shadow-sm">
      <div className="grid gap-2">
        <input name="title" placeholder="여행 이름" required
          className="rounded-lg border border-rule bg-paper px-3 py-2" />
        <div className="grid grid-cols-2 gap-2">
          <input name="date" type="date" required
            className="rounded-lg border border-rule bg-paper px-3 py-2" />
          <input name="end" type="date"
            className="rounded-lg border border-rule bg-paper px-3 py-2" />
        </div>
        <input name="place" placeholder="장소 (예: 경주)"
          className="rounded-lg border border-rule bg-paper px-3 py-2" />
        <div className="grid grid-cols-2 gap-2">
          <input name="people" type="number" min={1} max={30} defaultValue={4}
            className="rounded-lg border border-rule bg-paper px-3 py-2" />
          <select name="theme" className="rounded-lg border border-rule bg-paper px-3 py-2">
            {THEMES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-brand">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button disabled={busy}
          className="rounded-full bg-brand px-4 py-2 font-bold text-white disabled:opacity-50">
          {busy ? "만드는 중…" : "만들기"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-full border border-rule px-4 py-2">취소</button>
      </div>
      <p className="mt-2 text-xs text-muted">
        장소에 &ldquo;경주&rdquo;를 넣으면 지도·도로망이 붙은 일정 화면이 열립니다.
      </p>
    </form>
  );
}
