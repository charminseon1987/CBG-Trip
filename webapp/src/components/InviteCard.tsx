"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CatFace from "./CatFace";
import { api } from "@/lib/api";

interface Peek { tripId: string; title: string; date: string; role: string }

const ROLE: Record<string, string> = {
  editor: "같이 고칠 수 있습니다",
  viewer: "보기만 할 수 있습니다",
  owner: "주인으로 들어갑니다",
};

export default function InviteCard({ token }: { token: string }) {
  const router = useRouter();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Peek>(`/api/invites/${token}`)
      .then(setPeek)
      .catch((e) => setErr(e instanceof Error ? e.message : "초대장을 읽지 못했습니다."));
  }, [token]);

  async function join() {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ tripId: string }>(`/api/invites/${token}`, { method: "POST" });
      router.replace(`/trips/${r.tripId}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "들어가지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-5 px-6">
      <div className="flex items-center gap-3">
        <CatFace who="chief" size={54} ring="border-brand" className="border-[3px]" />
        <div>
          <p className="font-mono text-[12.5px] font-bold uppercase tracking-[0.18em] text-brand">
            Invitation
          </p>
          <h1 className="text-2xl font-bold">여행에 초대받았습니다</h1>
        </div>
      </div>

      {err ? (
        <>
          <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-bold text-brand">{err}</p>
          <a href="/" className="btn py-2.5 text-center">내 여행으로</a>
        </>
      ) : !peek ? (
        <p className="text-sm text-muted">초대장을 확인하는 중…</p>
      ) : (
        <>
          <div className="rounded-2xl border border-rule bg-card px-4 py-3">
            <p className="text-lg font-bold">{peek.title}</p>
            <p className="text-sm text-ink-2">{peek.date}</p>
            <p className="mt-1 text-xs text-muted">{ROLE[peek.role] ?? peek.role}</p>
          </div>
          <p className="text-sm text-ink-2">
            들어가면 이 여행의 일정·사진·가계부를 함께 봅니다. 일정은 공동으로 두고,
            나만 다르게 가고 싶은 곳은 내 쪽에서만 바꿀 수 있습니다.
          </p>
          <button disabled={busy} onClick={join} className="btn btn-primary py-2.5">
            {busy ? "들어가는 중…" : "이 여행에 들어가기"}
          </button>
          <a href="/" className="text-center text-sm text-muted">나중에 하기</a>
        </>
      )}
    </main>
  );
}
