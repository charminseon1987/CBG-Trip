"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ko } from "react-day-picker/locale";
import type { DateRange } from "react-day-picker";
import { api } from "@/lib/api";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Trip } from "@/lib/types";

const THEMES = ["가족", "아이와", "커플", "친구", "혼자", "액티비티", "휴양"];

function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function koDay(d: Date, withMonth = true) {
  return d.toLocaleDateString("ko-KR", withMonth
    ? { month: "long", day: "numeric", weekday: "short" }
    : { day: "numeric", weekday: "short" });
}

/** 여행 시작–끝을 한 번에 고르는 달력. hidden input 으로 date/end 를 FormData 에 넣는다 */
function TripDatesField() {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const from = range?.from;
  const to = range?.to;
  const multi = from && to && to.getTime() !== from.getTime();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input type="hidden" name="date" value={from ? ymd(from) : ""} />
      <input type="hidden" name="end" value={from ? ymd(to ?? from) : ""} />
      <PopoverTrigger asChild>
        <button type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-rule bg-paper px-3 py-2 text-left">
          <i className="ri-calendar-line text-muted" aria-hidden="true" />
          {from
            ? <span className="whitespace-nowrap">{koDay(from)}{multi && ` – ${koDay(to!, to!.getMonth() !== from.getMonth())}`}</span>
            : <span className="text-muted">여행 날짜 고르기</span>}
          <i className="ri-arrow-down-s-line ml-auto text-muted" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1">
        <Calendar
          mode="range"
          locale={ko}
          selected={range}
          numberOfMonths={1}
          defaultMonth={from}
          onSelect={(r) => {
            setRange(r);
            if (r?.from && r?.to && r.to.getTime() > r.from.getTime())
              setTimeout(() => setOpen(false), 180);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** 새 여행을 만드는 칸들 — 카드(NewTripForm)와 바닥 시트(NewTripSheet)가 같이 쓴다 */
export function TripForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!f.get("date")) {
      setErr("여행 날짜를 골라 주세요");
      return;
    }
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
      onDone?.();
      router.push(`/trips/${trip.id}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="grid gap-2">
        <input name="title" placeholder="여행 이름" required
          className="rounded-lg border border-rule bg-paper px-3 py-2" />
        <TripDatesField />
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
        {onDone && (
          <button type="button" onClick={onDone}
            className="rounded-full border border-rule px-4 py-2">취소</button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        장소에 &ldquo;경주&rdquo;를 넣으면 지도·도로망이 붙은 일정 화면이 열립니다.
      </p>
    </form>
  );
}

export default function NewTripForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    /* 앨범 자리에 놓인 빈 페이지 — 사진칸은 점선, 글씨는 손글씨 */
    return (
      <button
        onClick={() => setOpen(true)}
        className="album-card group block w-full text-left"
        style={{ "--tilt": "1.4deg" } as React.CSSProperties}
      >
        <figure className="polaroid">
          <div className="grid aspect-square w-full place-content-center rounded-sm border-2 border-dashed border-brand/40 bg-paper transition group-hover:border-brand group-hover:bg-brand-soft/50">
            <span className="grid h-12 w-12 place-content-center rounded-full bg-brand-soft text-2xl text-brand transition group-hover:bg-brand group-hover:text-white">
              <i className="ri-add-line" aria-hidden="true" />
            </span>
          </div>
          <figcaption style={{ color: "var(--brand)" }}>새 여행</figcaption>
        </figure>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-rule bg-card p-5 shadow-sm">
      <TripForm onDone={() => setOpen(false)} />
    </div>
  );
}
