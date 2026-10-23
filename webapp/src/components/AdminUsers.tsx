"use client";

import { useState } from "react";
import { api } from "@/lib/api";

interface U { id: string; email: string; name: string; role: string; createdAt: string }

export default function AdminUsers({ initial, meId }: { initial: U[]; meId: string }) {
  const [users, setUsers] = useState<U[]>(initial);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const reload = async () => setUsers((await api<{ users: U[] }>("/api/admin/users")).users);
  const run = async (fn: () => Promise<void>, okText: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); await reload(); setMsg({ kind: "ok", text: okText }); }
    catch (e) { setMsg({ kind: "bad", text: e instanceof Error ? e.message : "실패했습니다." }); }
    finally { setBusy(false); }
  };

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    await run(async () => {
      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: f.get("email"), name: f.get("name"),
          password: f.get("password"), role: f.get("role"),
        }),
      });
      form.reset();
      setAdding(false);
    }, "계정을 만들었습니다.");
  }

  const changeRole = (u: U, role: string) =>
    run(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ role }) }).then(() => {}),
        `${u.name} 의 권한을 바꿨습니다.`);

  const resetPw = (u: U) => {
    const pw = prompt(`${u.name} 의 새 비밀번호 (10자 이상)\n\n입력한 값은 해시로만 저장되고 원문은 남지 않습니다.`);
    if (!pw) return;
    return run(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ password: pw }) }).then(() => {}),
               `${u.name} 의 비밀번호를 바꿨습니다. 모든 기기에서 로그아웃됩니다.`);
  };

  const remove = (u: U) => {
    if (!confirm(`${u.name}(${u.email}) 을 지웁니다.\n그 사람의 여행·사진·지출도 함께 지워지고 되돌릴 수 없습니다.`)) return;
    return run(() => api(`/api/admin/users/${u.id}`, { method: "DELETE" }).then(() => {}),
               `${u.name} 을 지웠습니다.`);
  };

  return (
    <section className="mt-6 rounded-2xl border border-rule bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-rule px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-content-center rounded-xl text-base"
              style={{ background: "color-mix(in srgb, var(--z-zoo) 12%, white)", color: "var(--z-zoo)" }}>
          <i className="ri-group-line" />
        </span>
        <div>
          <h2 className="font-bold">사용자 관리</h2>
          <p className="text-xs text-muted">계정을 만들고 권한을 나눕니다.</p>
        </div>
        <button className="btn ml-auto" onClick={() => setAdding((v) => !v)}>
          <i className={adding ? "ri-close-line" : "ri-user-add-line"} />
          {adding ? "닫기" : "사용자 추가"}
        </button>
      </div>

      <div className="px-5 pb-5 pt-4">
      {msg && (
        <p className={`mb-3 flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-bold ${
          msg.kind === "ok" ? "bg-paper text-z-zoo" : "bg-brand-soft text-brand"}`}>
          <i className={msg.kind === "ok" ? "ri-checkbox-circle-line" : "ri-error-warning-line"} />
          {msg.text}
        </p>
      )}

      {adding && (
        <form onSubmit={add} className="mb-4 grid gap-3 rounded-2xl border border-rule bg-paper/60 p-4 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-muted">
            이름
            <input name="name" required maxLength={40}
              className="rounded-lg border border-rule bg-card px-3 py-2 text-sm text-ink" />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            이메일
            <input name="email" type="email" required
              className="rounded-lg border border-rule bg-card px-3 py-2 text-sm text-ink" />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            비밀번호 (10자 이상)
            <input name="password" type="password" required minLength={10}
              autoComplete="new-password" className="rounded-lg border border-rule bg-card px-3 py-2 text-sm text-ink" />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            권한
            <select name="role" className="rounded-lg border border-rule bg-card px-3 py-2 text-sm text-ink">
              <option value="member">일반 사용자</option>
              <option value="admin">관리자</option>
            </select>
          </label>
          <button disabled={busy} className="btn btn-primary sm:col-span-2">
            <i className="ri-user-add-line" /> 계정 만들기
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs text-muted">
              <th className="py-2.5 pr-3 font-normal">이름</th>
              <th className="px-3 py-2.5 font-normal">이메일</th>
              <th className="px-3 py-2.5 font-normal">가입일</th>
              <th className="px-3 py-2.5 font-normal">권한</th>
              <th className="py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-rule first:border-t-0">
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-content-center rounded-full bg-brand-soft text-sm font-extrabold text-brand">
                      {u.name.slice(0, 1)}
                    </span>
                    <b>{u.name}</b>
                    {u.id === meId && <span className="chip" style={{ color: "var(--brand)" }}>나</span>}
                  </div>
                </td>
                <td className="px-3 py-3 text-ink-2">{u.email}</td>
                <td className="px-3 py-3 font-mono text-xs text-muted">{u.createdAt.slice(0, 10)}</td>
                <td className="px-3 py-3">
                  <select value={u.role} disabled={busy}
                    onChange={(e) => changeRole(u, e.target.value)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                      u.role === "admin"
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-rule bg-card text-ink-2"}`}>
                    <option value="member">일반 사용자</option>
                    <option value="admin">관리자</option>
                  </select>
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <button className="btn" disabled={busy} onClick={() => resetPw(u)}>
                      <i className="ri-key-2-line" /> 비밀번호 재설정
                    </button>
                    <button className="btn" disabled={busy || u.id === meId} onClick={() => remove(u)}>
                      <i className="ri-delete-bin-line" /> 삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </section>
  );
}
