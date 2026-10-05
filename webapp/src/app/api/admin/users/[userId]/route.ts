import { z } from "zod";
import { fail, notFound, ok, parse } from "@/lib/http";
import {
  adminCount, checkPasswordStrength, currentUser, deleteUser, listUsers, setPassword, setRole,
} from "@/lib/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ userId: string }> };

async function admin() {
  const me = await currentUser();
  return me?.role === "admin" ? me : null;
}

const Patch = z.object({
  role: z.enum(["admin", "member"]).optional(),
  password: z.string().min(1).max(200).optional(),
});

/** 권한 바꾸기 · 비밀번호 재설정 */
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await admin();
  if (!me) return fail("forbidden", "관리자만 할 수 있습니다.", 403);
  const { userId } = await params;
  const target = (await listUsers()).find((u) => u.id === userId);
  if (!target) return notFound("사용자");

  const p = await parse(req, Patch);
  if (!p.ok) return p.res;

  if (p.data.role && p.data.role !== target.role) {
    // 마지막 관리자의 권한은 내릴 수 없다 — 아무도 못 들어가는 상태가 된다
    if (target.role === "admin" && p.data.role === "member" && (await adminCount()) <= 1) {
      return fail("last_admin", "관리자가 한 명뿐입니다. 다른 관리자를 먼저 만들어 주세요.", 409);
    }
    await setRole(userId, p.data.role);
  }
  if (p.data.password) {
    const weak = checkPasswordStrength(p.data.password);
    if (weak) return fail("weak_password", weak, 422);
    await setPassword(userId, p.data.password);   // 모든 기기에서 로그아웃된다
  }
  const after = (await listUsers()).find((u) => u.id === userId);
  return ok({ user: after });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await admin();
  if (!me) return fail("forbidden", "관리자만 할 수 있습니다.", 403);
  const { userId } = await params;
  if (userId === me.id) return fail("self", "자기 계정은 지울 수 없습니다.", 409);

  const target = (await listUsers()).find((u) => u.id === userId);
  if (!target) return notFound("사용자");
  if (target.role === "admin" && (await adminCount()) <= 1) {
    return fail("last_admin", "마지막 관리자는 지울 수 없습니다.", 409);
  }
  await deleteUser(userId);   // 그 사람의 여행·사진·지출도 같이 지워진다
  return ok({ deleted: userId });
}
