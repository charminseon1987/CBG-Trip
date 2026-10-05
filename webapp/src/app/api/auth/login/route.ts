import { z } from "zod";
import { cookies } from "next/headers";
import { fail, ok, parse } from "@/lib/http";
import {
  COOKIE, createSession, findByEmail, noteFail, noteOk, throttle, verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const p = await parse(req, Body);
  if (!p.ok) return p.res;
  const email = p.data.email.trim().toLowerCase();

  const blocked = throttle(email);
  if (blocked) return fail("throttled", blocked, 429);

  const row = await findByEmail(email);
  /* 메일이 없을 때도 같은 시간이 걸리게 해서 "이 메일은 있다/없다" 를 흘리지 않는다 */
  const okPw = row
    ? await verifyPassword(p.data.password, row.passwordHash)
    : await verifyPassword(p.data.password, "scrypt$x$AAAA");

  if (!row || !okPw) {
    noteFail(email);
    return fail("bad_login", "메일 주소나 비밀번호가 맞지 않습니다.", 401);
  }

  noteOk(email);
  const { token, expiresAt } = await createSession(row.id);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
  });
  return ok({
    user: { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.createdAt },
  });
}
