"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export default function UserMenu({
  user,
}: {
  user: { name: string; role: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  async function out() {
    setBusy(true);
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-ink-2">
        {user.name}
        {user.role === "admin" && <span className="ml-1 text-xs font-bold text-brand">관리자</span>}
      </span>
      {user.role === "admin" && <Link href="/admin" className="btn">관리</Link>}
      <button className="btn" disabled={busy} onClick={out}>로그아웃</button>
    </div>
  );
}
