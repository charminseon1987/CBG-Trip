"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ChatBoard from "./ChatBoard";
import Loader from "./Loader";
import { api } from "@/lib/api";

/* 대화 목록. 여행별 그룹 방과 일대일 방이 한 자리에 모인다.

   이 화면이 없던 동안 일대일 대화는 함께 탭 안에서만 열렸다 — 상대를 다시
   찾으려면 그 여행으로 들어가 멤버 목록에서 찾아야 했다. 받은 말에 답하려고
   그 길을 되짚는 사람은 없다. */

interface Room {
  room: string;
  kind: "trip" | "dm";
  title: string;
  tripId: string | null;
  partnerId: string | null;
  lastBody: string;
  lastAt: string;
  unread: number;
}

const ago = (iso: string) => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
};

export default function ChatRooms() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [open, setOpen] = useState<Room | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ rooms: Room[] }>("/api/chat/rooms");
      setRooms(d.rooms);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    void load();
    /* 목록은 20초마다. 열어 둔 방은 ChatBoard 가 8초마다 따로 받는다 */
    const t = setInterval(() => { if (!document.hidden && !open) void load(); }, 20_000);
    return () => clearInterval(t);
  }, [load, open]);

  /* 방을 닫고 나오면 안 읽은 수가 바뀌어 있다 */
  useEffect(() => {
    if (!open) void load();
  }, [open, load]);

  if (open) {
    /* 하단 탭이 아래를 덮으니 그 자리만큼 비운다 */
    return (
      <div className="mx-auto flex h-[calc(100vh-6rem)] w-full max-w-3xl flex-col px-4 pt-4">
        <div className="flex flex-none items-center gap-2">
          <button className="btn btn-ghost px-2 py-1 text-sm" onClick={() => setOpen(null)}>
            ← 대화 목록
          </button>
          <b className="truncate">{open.title}</b>
          {open.kind === "trip" && open.tripId && (
            <Link href={`/trips/${open.tripId}`} className="btn px-2 py-1 text-xs">
              여행 열기
            </Link>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <ChatBoard
            room={open.kind === "trip"
              ? { kind: "trip", tripId: open.tripId!, title: open.title }
              : { kind: "dm", userId: open.partnerId!, name: open.title }}
          />
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 pb-24">
      <h1 className="text-2xl font-bold">대화</h1>
      <p className="mt-1 text-sm text-ink-2">
        여행마다 그룹 대화가 하나씩 있습니다. 같이 가는 사람과 둘이서만 하는 대화도
        여기 모입니다.
      </p>

      {err && (
        <p className="mt-4 rounded-lg bg-brand-soft px-3 py-2 text-sm font-bold text-brand">{err}</p>
      )}

      {!rooms ? (
        <Loader />
      ) : rooms.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          아직 대화할 방이 없습니다. 여행에 들어가면 그 여행의 그룹 대화가 생깁니다.
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {rooms.map((r) => (
            <li key={r.room}>
              <button
                onClick={() => setOpen(r)}
                className="flex w-full items-center gap-3 rounded-2xl border border-rule bg-card px-4 py-3 text-left transition hover:border-brand/50"
              >
                <span aria-hidden className="text-lg">
                  {r.kind === "trip" ? "👨‍👩‍👧" : "💬"}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate">
                    {r.title}
                    <span className="ml-2 text-[11px] font-normal text-muted">
                      {r.kind === "trip" ? "그룹" : "둘이서"}
                    </span>
                  </b>
                  <span className="block truncate text-[12.5px] text-muted">
                    {r.lastBody || "아직 말이 없습니다"}
                  </span>
                </span>
                <span className="flex flex-none flex-col items-end gap-1">
                  <span className="text-[11px] text-muted">{ago(r.lastAt)}</span>
                  {r.unread > 0 && (
                    <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
                      {r.unread > 99 ? "99+" : r.unread}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
