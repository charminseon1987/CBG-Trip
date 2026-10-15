"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import CatFace from "./CatFace";
import { api } from "@/lib/api";
import type { Trip } from "@/lib/types";

/* 초대받는 쪽은 InviteCard 가 한다. 여기는 초대하는 쪽 —
   누가 같이 하고 있나 보고, 링크를 만들어 건네고, 잘못 보낸 링크를 거둔다. */

type Role = "owner" | "editor" | "viewer";

interface Member {
  userId: string; name: string; email: string; role: Role; joinedAt: string;
}
interface LiveInvite {
  handle: string; label: string; role: Role; expiresAt: number;
}
interface Payload {
  members: Member[];
  me: { id: string | null; role: Role | null; canEdit: boolean; canManage: boolean };
  invites: LiveInvite[];
}

const ROLE_NAME: Record<Role, string> = {
  owner: "주인", editor: "같이 고침", viewer: "보기만",
};
const ROLE_WHAT: Record<Role, string> = {
  owner: "일정·가계부를 고치고, 사람을 들이고 내보냅니다",
  editor: "공동 일정·가계부를 고칩니다",
  viewer: "공동 일정은 보기만 합니다. 자기 개인 일정은 고칩니다",
};

const day = (ms: number) =>
  new Date(ms).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });

export default function MembersBoard({ trip }: { trip: Trip }) {
  const router = useRouter();
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* 방금 만든 초대 링크. 서버는 이 값을 **한 번만** 준다 — DB 에는 해시만 남으므로
     화면을 떠나면 다시 볼 수 없다. 그래서 지우지 않고 남겨 둔다. */
  const [fresh, setFresh] = useState<{ url: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");

  const load = useCallback(async () => {
    try {
      setD(await api<Payload>(`/api/trips/${trip.id}/members`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, [trip.id]);
  useEffect(() => { void load(); }, [load]);

  /** 한 번 감싸 두면 단추마다 busy·에러 처리를 되풀이하지 않는다 */
  async function run(what: () => Promise<void>) {
    setBusy(true); setErr(null);
    try {
      await what();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const invite = () => run(async () => {
    const r = await api<{ url: string; expiresAt: number }>(
      `/api/trips/${trip.id}/members`,
      { method: "POST", body: JSON.stringify({ role, label: label.trim() }) },
    );
    setFresh({ url: r.url, label: label.trim() });
    setCopied(false);
    setLabel("");
    await load();
  });

  const copy = () => run(async () => {
    if (!fresh) return;
    /* 클립보드는 거부될 수 있다(권한·http). 그때도 링크는 칸에 그대로 보인다 */
    try {
      await navigator.clipboard.writeText(fresh.url);
      setCopied(true);
    } catch {
      setErr("복사가 막혔습니다. 아래 칸의 링크를 직접 복사해 주세요.");
    }
  });

  const setMemberRole = (userId: string, next: Role) => run(async () => {
    await api(`/api/trips/${trip.id}/members/${userId}`,
      { method: "PATCH", body: JSON.stringify({ role: next }) });
    await load();
  });

  const remove = (m: Member) => run(async () => {
    await api(`/api/trips/${trip.id}/members/${m.userId}`, { method: "DELETE" });
    await load();
  });

  const leave = () => run(async () => {
    if (!d?.me.id) return;
    await api(`/api/trips/${trip.id}/members/${d.me.id}`, { method: "DELETE" });
    /* 나간 여행은 이제 404 다. 목록으로 보낸다 */
    router.replace("/");
    router.refresh();
  });

  const revoke = (h: string) => run(async () => {
    await api(`/api/trips/${trip.id}/invites/${h}`, { method: "DELETE" });
    await load();
  });

  const manage = d?.me.canManage ?? false;

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-5 py-6 pb-28">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">함께 하는 사람</h2>
          <p className="text-sm text-ink-2">
            링크를 받은 사람만 들어옵니다. 일정·사진·가계부를 같이 보고,
            나만 다르게 가고 싶은 곳은 내 쪽에서만 바뀝니다.
          </p>
        </div>
        <CatFace who="chief" size={44} ring="border-brand" />
      </div>

      {err && (
        <p className="mt-4 rounded-lg bg-brand-soft px-3 py-2 text-sm font-bold text-brand">{err}</p>
      )}

      {!d ? (
        <p className="mt-6 text-sm text-muted">불러오는 중…</p>
      ) : (
        <>
          <ul className="mt-5 flex flex-col gap-2">
            {d.members.map((m) => {
              const self = m.userId === d.me.id;
              return (
                <li
                  key={m.userId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-rule bg-card px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {m.name || m.email}
                      {self && (
                        <span className="chip chip-solid ml-2 bg-brand text-[11px]">나</span>
                      )}
                    </p>
                    <p className="truncate font-mono text-[12px] text-muted">{m.email}</p>
                  </div>

                  {manage ? (
                    <select
                      value={m.role}
                      disabled={busy}
                      onChange={(e) => setMemberRole(m.userId, e.target.value as Role)}
                      aria-label={`${m.name || m.email} 권한`}
                      className="rounded-lg border border-rule bg-paper px-2 py-1.5 text-sm"
                    >
                      <option value="owner">주인</option>
                      <option value="editor">같이 고침</option>
                      <option value="viewer">보기만</option>
                    </select>
                  ) : (
                    <span className="chip text-[12px]">{ROLE_NAME[m.role]}</span>
                  )}

                  {manage && !self && (
                    <button
                      className="btn btn-ghost px-2 py-1 text-sm"
                      disabled={busy}
                      onClick={() => remove(m)}
                    >
                      내보내기
                    </button>
                  )}
                  {self && (
                    <button
                      className="btn btn-ghost px-2 py-1 text-sm"
                      disabled={busy}
                      onClick={leave}
                    >
                      나가기
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {!manage ? (
            <p className="mt-5 text-sm text-muted">
              사람을 더 들이는 것은 여행 주인이 합니다. 지금 당신은{" "}
              {ROLE_NAME[d.me.role ?? "viewer"]} 입니다 — {ROLE_WHAT[d.me.role ?? "viewer"]}.
            </p>
          ) : (
            <>
              <section className="mt-7">
                <h3 className="font-bold">초대 링크 만들기</h3>
                <p className="mt-0.5 text-sm text-ink-2">
                  링크는 만든 직후 한 번만 보입니다. 2주 지나면 저절로 죽고, 한 사람이 쓰면 끝납니다.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    maxLength={60}
                    placeholder="누구에게 보내는지 (예: 엄마)"
                    aria-label="초대장 메모"
                    className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                    aria-label="줄 권한"
                    className="rounded-lg border border-rule bg-paper px-2 py-2 text-sm"
                  >
                    <option value="editor">같이 고침</option>
                    <option value="viewer">보기만</option>
                  </select>
                  <button className="btn btn-primary px-4 py-2" disabled={busy} onClick={invite}>
                    {busy ? "만드는 중…" : "링크 만들기"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted">{ROLE_WHAT[role]}</p>

                {fresh && (
                  <div className="mt-3 rounded-2xl border-2 border-brand bg-brand-soft px-4 py-3">
                    <p className="text-sm font-bold text-brand">
                      {fresh.label ? `${fresh.label} 에게 보낼 링크` : "초대 링크"} — 지금 복사해 두세요
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        readOnly
                        value={fresh.url}
                        aria-label="초대 링크"
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-lg border border-rule bg-card px-3 py-2 font-mono text-[12px]"
                      />
                      <button className="btn px-3 py-2" onClick={copy} disabled={busy}>
                        {copied ? "복사했습니다" : "복사"}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {d.invites.length > 0 && (
                <section className="mt-7">
                  <h3 className="font-bold">아직 안 쓴 초대장</h3>
                  <ul className="mt-2 flex flex-col gap-2">
                    {d.invites.map((i) => (
                      <li
                        key={i.handle}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-rule bg-card px-4 py-2.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {i.label || "메모 없음"}
                          <span className="ml-2 text-muted">· {ROLE_NAME[i.role]}</span>
                        </span>
                        <span className="font-mono text-[12px] text-muted">
                          {day(i.expiresAt)}까지
                        </span>
                        <button
                          className="btn btn-ghost px-2 py-1 text-sm"
                          disabled={busy}
                          onClick={() => revoke(i.handle)}
                        >
                          취소
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted">
                    취소하면 그 링크는 바로 죽습니다. 이미 들어온 사람은 그대로 남습니다.
                  </p>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
