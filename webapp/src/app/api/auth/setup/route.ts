import { z } from "zod";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { fail, ok, parse } from "@/lib/http";
import {
  COOKIE, checkPasswordStrength, createSession, createUser, noteFail, noteOk, throttle, userCount,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/* 관리자는 아무나 되면 안 된다.

   예전에는 "사용자가 0명이면 만들어 준다" 였다. 혼자 쓰는 로컬에서는 괜찮았지만
   공개 주소에 올리면 선착순이 된다 — 주소를 아는 사람이 먼저 들어가 관리자가 되고,
   그 뒤로는 이미 설정이 끝났다며 주인이 못 들어간다.

   그래서 SETUP_CODE 를 아는 사람만 만들 수 있게 한다.
   코드를 안 걸어 둔 채 배포하면 설정 자체를 막는다 — 잠긴 편이 열린 편보다 낫다.
   (로컬 개발에서는 코드 없이 그냥 만들 수 있다) */
const CODE = process.env.SETUP_CODE || "";
const LOCAL = process.env.NODE_ENV !== "production";

const Body = z.object({
  email: z.string().email().max(120),
  name: z.string().min(1).max(40),
  password: z.string().min(1).max(200),
  code: z.string().max(200).default(""),
});

/** 길이가 달라도 시간이 새지 않게 비교한다 */
function sameCode(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(CODE);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** GET /api/auth/setup — 설정이 필요한가, 코드를 받아야 하는가 */
export async function GET() {
  try {
    return ok({
      needed: (await userCount()) === 0,
      codeRequired: Boolean(CODE) || !LOCAL,
      /* 코드도 없고 로컬도 아니면 설정할 길이 아예 없다 — 화면이 안내할 수 있게 알린다 */
      locked: !CODE && !LOCAL,
    });
  } catch (e) {
    return fail("no_db", e instanceof Error ? e.message : "DB 없음", 503);
  }
}

/** POST /api/auth/setup — 첫 관리자를 만든다. 사용자가 이미 있으면 거부한다. */
export async function POST(req: Request) {
  const p = await parse(req, Body);
  if (!p.ok) return p.res;

  if (!CODE && !LOCAL) {
    return fail(
      "setup_locked",
      "이 서버는 설정 코드가 없어 관리자 계정을 만들 수 없습니다. 환경 변수 SETUP_CODE 를 넣고 다시 배포해 주세요.",
      403,
    );
  }

  /* 코드를 찍어 맞히지 못하게 막는다.

     처음에는 "setup" 하나로 셌는데, 시험해 보니 남이 다섯 번 찍으면 주인까지
     같이 잠겼다 — 주인을 못 들어오게 만드는 길이 열린 셈이다.
     그래서 부르는 쪽 주소별로 센다. */
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const gate = `setup:${ip}`;
  const wait = throttle(gate);
  if (wait) return fail("throttled", wait, 429);

  if (CODE && !sameCode(p.data.code)) {
    noteFail(gate);
    return fail("bad_code", "설정 코드가 맞지 않습니다.", 403);
  }
  noteOk(gate);

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
