import { z } from "zod";
import { fail, ok, parse } from "@/lib/http";
import { checkPasswordStrength, createUser, currentUser, findByEmail, listUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function admin() {
  const me = await currentUser();
  return me?.role === "admin" ? me : null;
}

/** GET /api/admin/users — 사용자 목록 (관리자만) */
export async function GET() {
  if (!(await admin())) return fail("forbidden", "관리자만 볼 수 있습니다.", 403);
  return ok({ users: await listUsers() });
}

const New = z.object({
  email: z.string().email().max(120),
  name: z.string().min(1).max(40),
  password: z.string().min(1).max(200),
  role: z.enum(["admin", "member"]).default("member"),
});

/** POST /api/admin/users — 사람을 더한다 */
export async function POST(req: Request) {
  if (!(await admin())) return fail("forbidden", "관리자만 할 수 있습니다.", 403);
  const p = await parse(req, New);
  if (!p.ok) return p.res;

  const weak = checkPasswordStrength(p.data.password);
  if (weak) return fail("weak_password", weak, 422);
  if (await findByEmail(p.data.email)) {
    return fail("duplicate", "이미 쓰고 있는 메일 주소입니다.", 409);
  }
  const user = await createUser(p.data.email, p.data.name, p.data.password, p.data.role);
  return ok({ user }, { status: 201 });
}
