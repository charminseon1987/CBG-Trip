"use client";

/* 서버가 그린 화면의 데이터만 다시 긁는다 — 페이지를 통째로 다시 여는
   /admin 링크는 같은 주소면 다시 렌더링하지 않을 수 있어서,
   router.refresh() 가 맞는 길이다 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminRefresh() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn !h-9 !w-9 !p-0"
      title="새로고침"
      aria-label="새로고침"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        router.refresh();
        setTimeout(() => setBusy(false), 700);
      }}
    >
      <i className={`ri-refresh-line ${busy ? "animate-spin" : ""}`} />
    </button>
  );
}
