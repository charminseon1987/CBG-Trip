"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

/* 여행을 찾아 문을 두드리는 쪽 화면.

   초대 링크를 받지 못한 사람도 들어올 길이 있어야 한다. 대신 아무 여행이나
   보이지는 않는다 — 주인이 "찾을 수 있게" 를 켠 여행만 나온다. 찾아도 보이는
   것은 제목·지역·날짜·인원까지고, 일정·사진·가계부는 주인이 허용한 뒤에 열린다. */

type Role = "owner" | "editor" | "viewer";
type Status = "pending" | "approved" | "rejected";

interface Found {
  id: string; title: string; place: string; date: string; end: string;
  people: number; theme: string;
  mine: Role | null;      // 이미 멤버인가
  request: Status | null; // 내 신청 상태
}

const span = (t: Found) => (t.end && t.end !== t.date ? `${t.date} ~ ${t.end}` : t.date);

export default function TripSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Found[] | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function find() {
    const needle = q.trim();
    if (needle.length < 2) {
      setErr("두 자 이상 적어 주세요.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const d = await api<{ trips: Found[] }>(`/api/trips/search?q=${encodeURIComponent(needle)}`);
      setRows(d.trips);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "찾지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function ask(t: Found) {
    setBusy(true); setErr(null);
    try {
      await api(`/api/trips/${t.id}/join`, {
        method: "POST", body: JSON.stringify({ message: (msg[t.id] ?? "").trim() }),
      });
      /* 다시 찾아 상태를 새로 받는다 — "기다리는 중" 으로 바뀐다 */
      await find();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "신청하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(t: Found) {
    setBusy(true); setErr(null);
    try {
      await api(`/api/trips/${t.id}/join`, { method: "DELETE" });
      await find();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "거두지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12" aria-label="여행 찾기">
      <div className="rounded-2xl border border-rule bg-gradient-to-b from-brand-soft/60 via-brand-soft/25 to-card p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-content-center rounded-full bg-brand text-white shadow-sm">
            <i className="ri-search-line text-lg" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight">여행 찾기</h2>
            <p className="text-[13px] text-ink-2">
              초대 링크 없이도 이름·지역으로 찾아 함께하기를 신청해요
            </p>
          </div>
        </div>

        <form
          className="mt-4 flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); void find(); }}
        >
          <div className="relative min-w-0 flex-1">
            <i
              className="ri-search-line pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="여행 이름 또는 지역 (예: 경주)"
              aria-label="여행 이름 또는 지역"
              className="w-full rounded-full border-2 border-transparent bg-card py-3 pl-11 pr-4 text-[15px] shadow-sm transition placeholder:text-muted/70 focus:border-brand focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary shrink-0 px-5 py-3 text-[15px]"
            disabled={busy}
          >
            {busy ? "찾는 중…" : "찾기"}
          </button>
        </form>

        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted">
          <i className="ri-lock-2-line" aria-hidden="true" />
          주인이 켜 둔 여행만 나오고, 허용 전에는 제목·날짜만 보여요
        </p>

        {err && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-sm font-bold text-brand shadow-sm">
            <i className="ri-error-warning-line" aria-hidden="true" />
            {err}
          </p>
        )}

        {rows && rows.length === 0 && (
          <div className="mt-4 flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-brand/40 bg-card px-4 py-6 text-center">
            <i className="ri-compass-3-line text-2xl text-muted" aria-hidden="true" />
            <p className="text-sm font-bold">찾은 여행이 없습니다</p>
            <p className="text-xs text-muted">
              주인이 검색을 켜 두지 않았을 수도 있습니다 — 초대 링크를 받는 쪽이 빠릅니다
            </p>
          </div>
        )}

        {rows && rows.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {rows.map((t) => (
              <li
                key={t.id}
                className="rounded-xl border border-rule bg-card px-4 py-3.5 shadow-sm transition hover:border-brand/60"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-[15px] font-bold">{t.title}</p>
                  <span className="flex items-center gap-1 font-mono text-[12px] text-muted">
                    <i className="ri-calendar-line" aria-hidden="true" />
                    {span(t)}
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-2">
                  <i className="ri-map-pin-2-line text-muted" aria-hidden="true" />
                  {t.place} · {t.people}명 · {t.theme}
                </p>

                {t.mine ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-z-zoo">
                      <i className="ri-checkbox-circle-fill" aria-hidden="true" />
                      이미 들어와 있는 여행
                    </span>
                    <Link
                      href={`/trips/${t.id}`}
                      className="btn px-3 py-1.5 text-sm"
                    >
                      열기
                      <i className="ri-arrow-right-line" aria-hidden="true" />
                    </Link>
                  </div>
                ) : t.request === "pending" ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="chip text-[12px]" style={{ color: "var(--z-amer)" }}>
                      기다리는 중 — 주인의 답을 기다립니다
                    </span>
                    <button className="btn btn-ghost px-2 py-1 text-sm" disabled={busy}
                      onClick={() => cancel(t)}>신청 거두기</button>
                  </div>
                ) : t.request === "rejected" ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="chip text-[12px]" style={{ color: "var(--rose)" }}>
                      거절된 여행입니다
                    </span>
                    <button className="btn px-3 py-1.5 text-sm" disabled={busy}
                      onClick={() => ask(t)}>다시 신청</button>
                  </div>
                ) : (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <input
                      value={msg[t.id] ?? ""}
                      onChange={(e) => setMsg((v) => ({ ...v, [t.id]: e.target.value }))}
                      maxLength={200}
                      placeholder="누구인지 한 줄 (예: 엄마 친구예요)"
                      aria-label={`${t.title} 에 보낼 한 줄`}
                      className="min-w-0 flex-1 rounded-full border border-rule bg-paper px-3.5 py-2 text-sm transition focus:border-brand focus:outline-none"
                    />
                    <button className="btn btn-primary px-4 py-2 text-sm" disabled={busy}
                      onClick={() => ask(t)}>들어가기 신청</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
