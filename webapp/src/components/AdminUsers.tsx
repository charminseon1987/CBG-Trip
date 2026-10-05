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
    <section className="mt-8">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">사용자</h2>
        <button className="btn" onClick={() => setAdding((v) => !v)}>
          {adding ? "닫기" : "+ 사람 추가"}
        </button>
      </div>

      {msg && (
        <p className={`mt-2 rounded-lg px-3 py-2 text-sm font-bold ${
          msg.kind === "ok" ? "bg-paper text-z-zoo" : "bg-brand-soft text-brand"}`}>
          {msg.text}
        </p>
      )}

      {adding && (
        <form onSubmit={add} className="mt-3 grid gap-2 rounded-xl border border-rule bg-card p-4 sm:grid-cols-2">
          <input name="name" placeholder="이름" required maxLength={40}
            className="rounded-lg border border-rule bg-paper px-3 py-2" />
          <input name="email" type="email" placeholder="메일 주소" required
            className="rounded-lg border border-rule bg-paper px-3 py-2" />
          <input name="password" type="password" placeholder="비밀번호 (10자 이상)" required minLength={10}
            autoComplete="new-password" className="rounded-lg border border-rule bg-paper px-3 py-2" />
          <select name="role" className="rounded-lg border border-rule bg-paper px-3 py-2">
            <option value="member">일반</option>
            <option value="admin">관리자</option>
          </select>
          <button disabled={busy} className="btn btn-primary sm:col-span-2">만들기</button>
        </form>
      )}

      <div className="mt-3 overflow-x-auto rounded-xl border border-rule bg-card">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs text-muted">
              <th className="p-3 font-normal">이름</th>
              <th className="p-3 font-normal">메일</th>
              <th className="p-3 font-normal">권한</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-rule">
                <td className="p-3">
                  <b>{u.name}</b>
                  {u.id === meId && <span className="ml-1 text-xs text-brand">(나)</span>}
                </td>
                <td className="p-3 text-ink-2">{u.email}</td>
                <td className="p-3">
                  <select value={u.role} disabled={busy}
                    onChange={(e) => changeRole(u, e.target.value)}
                    className="rounded border border-rule bg-paper px-2 py-1 text-xs font-bold">
                    <option value="member">일반</option>
                    <option value="admin">관리자</option>
                  </select>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    <button className="btn" disabled={busy} onClick={() => resetPw(u)}>비밀번호 재설정</button>
                    <button className="btn" disabled={busy || u.id === meId} onClick={() => remove(u)}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
