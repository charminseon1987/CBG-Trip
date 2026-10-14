import { z } from "zod";
import { cookies } from "next/headers";
import { fail, ok, parse } from "@/lib/http";
import {
  COOKIE, checkPasswordStrength, createSession, currentUser, findByEmail,
  noteFail, noteOk, setPassword, throttle, verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/* 자기 비밀번호를 자기가 바꾼다.

   여태 바꿀 길이 관리자 화면(PATCH /api/admin/users/:id)뿐이었다. 그래서
   관리자가 자기 비밀번호를 잊으면 아무도 손을 못 댔다 — DB 를 직접 열어야 했다.
   (실제로 한 번 그랬다. DEPLOY.md 참고)

   지금 비밀번호를 함께 받는다. 쿠키만으로 바꾸게 하면 남의 자리를 잠깐
   빌린 사람이 주인을 영영 쫓아낼 수 있다. */

const Body = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(1).max(200),
});

export async function PUT(req: Request) {
  const me = await currentUser();
  if (!me) return fail("unauthorized", "로그인이 필요합니다.", 401);

  const p = await parse(req, Body);
  if (!p.ok) return p.res;

  /* 지금 비밀번호를 찍어 맞히지 못하게 막는다. 로그인과 같은 셈법이되
     열쇠는 사람 id 다 — 메일로 세면 로그인 쪽 횟수와 섞인다. */
  const gate = `pw:${me.id}`;
  const blocked = throttle(gate);
  if (blocked) return fail("throttled", blocked, 429);

  const row = await findByEmail(me.email);
  if (!row) return fail("unauthorized", "로그인이 필요합니다.", 401);

  if (!(await verifyPassword(p.data.current, row.passwordHash))) {
    noteFail(gate);
    return fail("bad_password", "지금 비밀번호가 맞지 않습니다.", 403);
  }
  noteOk(gate);

  const weak = checkPasswordStrength(p.data.next);
  if (weak) return fail("weak_password", weak, 422);
  if (p.data.current === p.data.next) {
    return fail("same_password", "지금 쓰는 것과 같습니다.", 422);
  }

  /* setPassword 는 이 사람의 세션을 전부 지운다 — 바꾼 목적이 그것이다.
     다만 지금 이 기기까지 쫓아내면 바꾸자마자 로그인 화면으로 떨어진다.
     그래서 지우고 난 뒤 이 기기 몫으로 하나를 새로 발급한다.
     (다른 기기는 그대로 끊긴다) */
  await setPassword(me.id, p.data.next);
  const { token, expiresAt } = await createSession(me.id);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
  });

  return ok({ changed: true });
}
