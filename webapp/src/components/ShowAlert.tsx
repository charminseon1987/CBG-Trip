"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanRowDTO } from "./PlanBoard";

/** "HH:MM" → 분 */
const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

export interface ShowDue {
  row: PlanRowDTO;
  minutesLeft: number;
}

/**
 * 공연은 시각이 고정이라 놓치면 끝이다. 시작 10분 전에 한 번 알린다.
 *
 * - 같은 공연을 두 번 알리지 않는다 (한 번 뜨면 그 id 는 기억해 둔다)
 * - 이미 지난 공연은 알리지 않는다
 * - 창을 열어 둔 채로 날짜가 바뀌어도 그날 일정만 본다
 */
export function useShowAlert(rows: PlanRowDTO[], tripDate: string, leadMin = 10) {
  const [due, setDue] = useState<ShowDue | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (today !== tripDate) return;              // 여행날이 아니면 알리지 않는다
      const nowMin = now.getHours() * 60 + now.getMinutes();

      for (const r of rows) {
        if (r.kind !== "show") continue;
        if (seen.current.has(r.id)) continue;
        const left = toMin(r.at) - nowMin;
        if (left <= leadMin && left >= 0) {
          seen.current.add(r.id);
          setDue({ row: r, minutesLeft: left });
          return;
        }
      }
    };
    check();
    const t = setInterval(check, 30_000);          // 30초마다 확인
    return () => clearInterval(t);
  }, [rows, tripDate, leadMin]);

  return { due, dismiss: () => setDue(null) };
}

export default function ShowAlertDialog({
  due, onGo, onClose,
}: {
  due: ShowDue | null;
  onGo: () => void;
  onClose: () => void;
}) {
  if (!due) return null;
  const { row, minutesLeft } = due;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/35 p-4"
      role="alertdialog" aria-modal="true" aria-labelledby="showalert-t">
      <div className="w-[min(26rem,100%)] rounded-2xl border-2 border-brand bg-card p-5 shadow-2xl">
        <p className="text-xs font-bold text-brand">공연 알림</p>
        <h2 id="showalert-t" className="mt-1 text-xl font-bold">{row.name}</h2>
        <p className="mt-2 text-ink-2">
          공연이 <b className="text-brand">{minutesLeft}분 후</b>({row.at}) 시작합니다. 이동하시겠습니까?
        </p>
        {row.note && <p className="mt-2 rounded-lg bg-paper p-3 text-sm text-ink-2">{row.note}</p>}
        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary flex-1" onClick={onGo}>예 — 길안내 시작</button>
          <button className="btn" onClick={onClose}>아니요</button>
        </div>
      </div>
    </div>
  );
}
