"use client";

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
    <section className="mt-10" aria-label="여행 찾기">
      <h2 className="text-lg font-bold">여행 찾기</h2>
      <p className="mt-0.5 text-sm text-ink-2">
        초대 링크를 못 받았어도 여행 이름이나 지역으로 찾아 신청할 수 있습니다.
        주인이 <b>찾을 수 있게</b> 를 켜 둔 여행만 나옵니다. 허용되기 전에는 제목·날짜
        말고는 아무것도 보이지 않습니다.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void find(); }}
          placeholder="여행 이름 또는 지역 (예: 경주)"
          aria-label="여행 이름 또는 지역"
          className="min-w-0 flex-1 rounded-lg border border-rule bg-card px-3 py-2 text-sm"
        />
        <button className="btn btn-primary px-4 py-2" disabled={busy} onClick={find}>
          {busy ? "찾는 중…" : "찾기"}
        </button>
      </div>

      {err && (
        <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm font-bold text-brand">{err}</p>
      )}

      {rows && rows.length === 0 && (
        <p className="mt-3 text-sm text-muted">
          찾은 여행이 없습니다. 주인이 검색을 켜 두지 않았을 수도 있습니다 —
          그때는 초대 링크를 받아 들어오는 쪽이 빠릅니다.
        </p>
      )}

      {rows && rows.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((t) => (
            <li key={t.id} className="rounded-2xl border border-rule bg-card px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold">{t.title}</p>
                <span className="font-mono text-[12px] text-muted">{span(t)}</span>
              </div>
              <p className="text-sm text-ink-2">
                {t.place} · {t.people}명 · {t.theme}
              </p>

              {t.mine ? (
                <p className="mt-2 text-sm font-bold text-brand">이미 들어와 있는 여행입니다</p>
              ) : t.request === "pending" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="chip text-[12px]">기다리는 중 — 주인의 답을 기다립니다</span>
                  <button className="btn btn-ghost px-2 py-1 text-sm" disabled={busy}
                    onClick={() => cancel(t)}>신청 거두기</button>
                </div>
              ) : t.request === "rejected" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="chip text-[12px]">거절된 여행입니다</span>
                  <button className="btn px-2 py-1 text-sm" disabled={busy}
                    onClick={() => ask(t)}>다시 신청</button>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={msg[t.id] ?? ""}
                    onChange={(e) => setMsg((v) => ({ ...v, [t.id]: e.target.value }))}
                    maxLength={200}
                    placeholder="누구인지 한 줄 (예: 엄마 친구예요)"
                    aria-label={`${t.title} 에 보낼 한 줄`}
                    className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
                  />
                  <button className="btn btn-primary px-3 py-2 text-sm" disabled={busy}
                    onClick={() => ask(t)}>들어가기 신청</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
