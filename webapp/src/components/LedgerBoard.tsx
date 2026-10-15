"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CatFace from "./CatFace";
import { api } from "@/lib/api";
import { parseCardCsv, parseCardSms, toCsv, type Parsed } from "@/lib/cardimport";
import { EXPENSE_CATEGORIES, type ExpenseCategory, type Trip } from "@/lib/types";

interface Row {
  id: string; amount: number; category: ExpenseCategory;
  memo: string; date: string; at: string; place: string | null;
}
interface Summary { total: number; count: number; people: number; perPerson: number }
/** 날마다의 합계 — 서버가 세어 준다. 화면이 다시 더하지 않는다 */
interface DaySum {
  date: string; day: number | null; label: string;
  count: number; total: number; perPerson: number;
}

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const catName = (id: string) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.name ?? id;
const catColor = (id: string) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.color ?? "#8A7C94";

export default function LedgerBoard({ trip }: { trip: Trip }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [sum, setSum] = useState<Summary | null>(null);
  const [days, setDays] = useState<DaySum[]>([]);
  /* 어느 날만 볼까. null 이면 전부 */
  const [only, setOnly] = useState<string | null>(null);
  const [draft, setDraft] = useState<Parsed[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const d = await api<{ rows: Row[]; summary: Summary; days: DaySum[] }>(
      `/api/trips/${trip.id}/expenses`,
    );
    setRows(d.rows);
    setSum(d.summary);
    setDays(d.days ?? []);
  }, [trip.id]);
  useEffect(() => { void load(); }, [load]);

  /* ---------- 가져오기 ---------- */
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const text = await f.text();
    const r = parseCardCsv(text);
    setDraft(r.rows);
    setNote(`${f.name} — ${r.rows.length}건 읽음${r.skipped ? `, ${r.skipped}줄 건너뜀` : ""}. ${r.note}`);
  }
  function onPaste() {
    const text = prompt("결제 알림 문자나 명세서 내용을 붙여넣으세요.\n(여러 줄 가능)");
    if (!text) return;
    const r = text.includes(",") || text.includes("\t") ? parseCardCsv(text) : parseCardSms(text);
    setDraft(r.rows);
    setNote(`${r.rows.length}건 읽음${r.skipped ? `, ${r.skipped}줄 건너뜀` : ""}. ${r.note}`);
  }

  async function commitDraft() {
    if (!draft?.length) return;
    setBusy(true);
    try {
      await api(`/api/trips/${trip.id}/expenses/bulk`, {
        method: "POST",
        body: JSON.stringify({
          /* 명세서에 날짜가 있으면 그대로 보낸다. 없으면 서버가 여행 첫날로 넣는다 —
             전에는 여기서 d.date 를 버려서 며칠짜리 여행의 날짜가 다 뭉쳤다 */
          rows: draft.map((d) => ({
            amount: d.amount, category: d.category, memo: d.merchant, at: d.at,
            ...(d.date ? { date: d.date } : {}),
          })),
        }),
      });
      setDraft(null); setNote(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "넣지 못했습니다.");
    } finally { setBusy(false); }
  }

  /* ---------- 표 편집 ---------- */
  async function patch(id: string, p: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
    await api(`/api/trips/${trip.id}/expenses/${id}`, { method: "PATCH", body: JSON.stringify(p) })
      .catch(() => {});
    await load();
  }
  async function remove(id: string) {
    await api(`/api/trips/${trip.id}/expenses/${id}`, { method: "DELETE" });
    await load();
  }

  function exportCsv() {
    const blob = new Blob([toCsv(shown.map((r) => ({ ...r, merchant: r.memo })))],
      { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `가계부-${trip.title}-${trip.date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const byCat = EXPENSE_CATEGORIES.map((c) => ({
    ...c, total: rows.filter((r) => r.category === c.id).reduce((s, r) => s + r.amount, 0),
  }));
  const max = Math.max(1, ...byCat.map((c) => c.total));
  /* 날짜 띠에서 하루를 고르면 그 날만 보여 준다 */
  const shown = only ? rows.filter((r) => r.date === only) : rows;

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-5 py-6 pb-28">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">가계부</h2>
          <p className="text-sm text-ink-2">
            카드사 앱에서 받은 명세서(CSV)나 결제 알림 문자를 넣으면 분류해서 표로 만듭니다. 표에서 바로 고칠 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => fileRef.current?.click()}>명세서 파일</button>
          <button className="btn" onClick={onPaste}>문자 붙여넣기</button>
          <button className="btn" disabled={!rows.length} onClick={exportCsv}>엑셀로 내보내기</button>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={onFile} />
        </div>
      </div>

      {/* 실시간 자동 수집은 왜 없는지 */}
      <details className="mt-3 rounded-xl border border-rule bg-card p-3 text-sm">
        <summary className="cursor-pointer font-bold">카드 내역이 자동으로 안 들어오는 이유</summary>
        <p className="mt-2 text-ink-2">
          실시간 카드 거래내역 조회는 <b>마이데이터(본인신용정보관리업)</b> 허가나 <b>오픈뱅킹</b> 참가기관
          등록이 있어야 가능합니다. 둘 다 금융위원회·금융결제원이 법인에게만 내주고, 카드사 사설 API 는
          공개돼 있지 않습니다. 카드번호를 받아 대신 조회하는 방식은 안전하지 않아 만들지 않았습니다.
          대신 카드사 앱에서 <b>이용대금명세서</b>를 CSV 로 내려받아 넣으면 같은 결과를 얻습니다.
        </p>
      </details>

      {/* 읽어 온 내역 — 넣기 전에 확인 */}
      {draft && (
        <div className="mt-4 rounded-xl border-2 border-brand bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-sm">읽어 온 내역 {draft.length}건</b>
            <span className="text-xs text-muted">{note}</span>
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {draft.map((d, i) => (
                  <tr key={i} className="border-t border-rule">
                    <td className="py-1 font-mono text-xs text-muted">{d.at}</td>
                    <td className="truncate py-1">{d.merchant}</td>
                    <td className="py-1">
                      <select value={d.category}
                        onChange={(e) => setDraft((p) => p!.map((x, k) =>
                          k === i ? { ...x, category: e.target.value as ExpenseCategory, guessed: false } : x))}
                        className={`rounded border px-1 py-0.5 text-xs ${d.guessed ? "border-brand text-brand" : "border-rule"}`}>
                        {EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="py-1 text-right font-mono">{won(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {draft.some((d) => d.guessed) && (
            <p className="mt-2 text-xs text-brand">
              분홍색 분류는 가맹점 이름으로 <b>추측</b>한 것입니다. 넣기 전에 확인해 주세요.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={commitDraft}>
              {busy ? "넣는 중…" : `${draft.length}건 넣기`}
            </button>
            <button className="btn" onClick={() => { setDraft(null); setNote(null); }}>취소</button>
          </div>
        </div>
      )}

      {/* 합계 */}
      {sum && (
        <div className="mt-5">
          <p className="font-mono text-3xl font-bold">{won(sum.total)}</p>
          <p className="text-sm text-muted">
            {sum.count}건 · 1인당 {won(sum.perPerson)} ({sum.people}명)
          </p>
          <div className="mt-3 flex flex-col gap-1">
            {byCat.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-right text-ink-2">{c.name}</span>
                <span className="h-3 rounded-full" style={{ width: `${(c.total / max) * 70}%`, background: c.color }} />
                <span className="font-mono text-muted">{won(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 날짜 띠 — 1박2일 이상이면 날마다 나눠 본다. 하루 여행이면 숨긴다 */}
      {days.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-1">
          <button
            onClick={() => setOnly(null)}
            aria-selected={only === null}
            className={`rounded-full px-3 py-1 text-[12.5px] transition ${
              only === null ? "bg-brand font-bold text-white" : "text-muted hover:bg-paper"
            }`}
          >
            전체
          </button>
          {days.map((d) => (
            <button
              key={d.date}
              onClick={() => setOnly(d.date)}
              aria-selected={only === d.date}
              title={d.day ? `${d.label} · ${won(d.total)}` : `${d.label} · 여행 기간 밖`}
              className={`rounded-full px-3 py-1 text-[12.5px] transition ${
                only === d.date ? "bg-brand font-bold text-white" : "text-muted hover:bg-paper"
              } ${d.day ? "" : "italic"}`}
            >
              {d.day ? `${d.day}일차` : "기간 밖"}
              <span className="ml-1 opacity-70">{d.count ? won(d.total) : "—"}</span>
            </button>
          ))}
        </div>
      )}

      {/* 고른 날의 합계 */}
      {only && (
        <p className="mt-2 text-sm text-ink-2">
          {days.find((d) => d.date === only)?.label} —{" "}
          <b className="font-mono">{won(days.find((d) => d.date === only)?.total ?? 0)}</b>
          {" · "}1인당 {won(days.find((d) => d.date === only)?.perPerson ?? 0)}
        </p>
      )}

      {/* 표 — 바로 고칠 수 있다 */}
      {shown.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <CatFace who="ledger" size={120} ring="border-brand" className="border-[3px]" />
          <p className="text-ink-2">
            아직 기록이 없습니다.<br />명세서 파일을 넣거나 결제 문자를 붙여넣어 보세요.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-rule bg-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-xs text-muted">
                <th className="p-2 font-normal">날짜</th>
                <th className="p-2 font-normal">시각</th>
                <th className="p-2 font-normal">분류</th>
                <th className="p-2 font-normal">내용</th>
                <th className="p-2 text-right font-normal">금액</th>
                <th className="p-2 font-normal">장소</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-rule">
                  <td className="p-1">
                    {/* 날짜를 옮기면 그 날 그 시각의 장소가 다시 붙는다 */}
                    <input type="date" defaultValue={r.date}
                      onBlur={(e) => e.target.value && patch(r.id, { date: e.target.value })}
                      className="w-32 rounded border border-rule bg-paper px-1 py-0.5 font-mono text-xs" />
                  </td>
                  <td className="p-1">
                    <input type="time" defaultValue={r.at} onBlur={(e) => patch(r.id, { at: e.target.value })}
                      className="w-24 rounded border border-rule bg-paper px-1 py-0.5 font-mono text-xs" />
                  </td>
                  <td className="p-1">
                    <select value={r.category}
                      onChange={(e) => patch(r.id, { category: e.target.value as ExpenseCategory })}
                      className="rounded border border-rule bg-paper px-1 py-0.5 text-xs font-bold"
                      style={{ color: catColor(r.category) }}>
                      {EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className="p-1">
                    <input defaultValue={r.memo} onBlur={(e) => patch(r.id, { memo: e.target.value })}
                      className="w-full rounded border border-rule bg-paper px-1 py-0.5 text-xs" />
                  </td>
                  <td className="p-1 text-right">
                    <input type="number" defaultValue={r.amount}
                      onBlur={(e) => patch(r.id, { amount: Number(e.target.value) || r.amount })}
                      className="w-24 rounded border border-rule bg-paper px-1 py-0.5 text-right font-mono text-xs" />
                  </td>
                  <td className="p-2 text-xs text-muted">{r.place ?? "—"}</td>
                  <td className="p-1">
                    <button className="icb" title="삭제" onClick={() => remove(r.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        날짜나 시각을 고치면 그 날 그 시각에 있던 일정 장소가 자동으로 다시 붙습니다.
        분류 이름은 {catName("ticket")} 등 여섯 가지로 고정입니다.
      </p>
    </div>
  );
}
