import { z } from "zod";
import { cookies } from "next/headers";
import { fail, ok, parse } from "@/lib/http";
import {
  COOKIE, checkPasswordStrength, createSession, createUser, userCount,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(120),
  name: z.string().min(1).max(40),
  password: z.string().min(1).max(200),
});

/** GET /api/auth/setup — 설정이 필요한 상태인가 (아직 아무도 없는가) */
export async function GET() {
  try {
    return ok({ needed: (await userCount()) === 0 });
  } catch (e) {
    return fail("no_db", e instanceof Error ? e.message : "DB 없음", 503);
  }
}

/** POST /api/auth/setup — 첫 관리자를 만든다. 사용자가 이미 있으면 거부한다. */
export async function POST(req: Request) {
  const p = await parse(req, Body);
  if (!p.ok) return p.res;

  if ((await userCount()) > 0) {
    return fail("already_setup", "이미 설정이 끝났습니다. 로그인해 주세요.", 409);
  }
  const weak = checkPasswordStrength(p.data.password);
  if (weak) return fail("weak_password", weak, 422);

  const user = await createUser(p.data.email, p.data.name, p.data.password, "admin");
  const { token, expiresAt } = await createSession(user.id);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
  });
  return ok({ user }, { status: 201 });
}
