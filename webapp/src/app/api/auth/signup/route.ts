import { z } from "zod";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { fail, ok, parse } from "@/lib/http";
import {
  COOKIE, checkPasswordStrength, createSession, createUser, findByEmail, rateLimit, userCount,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/* 스스로 계정을 만드는 길.

   지금까지 사람이 생기는 길은 셋이었다 — /setup(첫 관리자 하나), 관리자가
   /api/admin/users 로 만들어 주기, 카카오로 처음 들어오기. 그래서 초대 링크를
   받은 사람이 계정이 없으면 막혔다. 카카오 키를 안 걸어 둔 곳에서는 더더욱.

   관리자는 여기서 나오지 않는다 — 언제나 member 다. 관리자를 늘리려면
   이미 있는 관리자가 올려 주어야 한다.

   SIGNUP_CODE 를 환경 변수에 넣으면 그 코드를 아는 사람만 가입할 수 있다.
   안 넣으면 주소를 아는 사람은 누구나 만든다 — 집에서 쓰는 주소면 그걸로 되고,
   공개 주소에 올렸다면 코드를 걸어 두는 쪽이 낫다. */
const CODE = process.env.SIGNUP_CODE || "";

/** 길이가 달라도 시간이 새지 않게 비교한다 */
function sameCode(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(CODE);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const Body = z.object({
  email: z.string().email().max(120),
  name: z.string().min(1).max(40),
  password: z.string().min(1).max(200),
  code: z.string().max(200).default(""),
});

/** GET — 가입을 받는가, 코드를 받아야 하는가. 화면이 모양을 정하는 데 쓴다 */
export async function GET() {
  const n = await userCount().catch(() => -1);
  return ok({ open: n > 0, codeRequired: !!CODE });
}

export async function POST(req: Request) {
  /* 한 자리에서 몰아 만들지 못하게. 주소를 못 읽는 곳에서는 한 덩어리로 묶인다 */
  const who = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const wait = rateLimit(`signup:${who}`, 5, 600_000);
  if (wait) return fail("throttled", wait, 429);

  /* 아무도 없는 DB 에서 가입을 받아 주면 관리자 자리가 비어 버린다 —
     /setup 이 "이미 사람이 있다" 며 막아 아무도 관리자가 못 된다 */
  const n = await userCount().catch(() => -1);
  if (n === 0) return fail("setup_first", "첫 계정은 설정 화면에서 만듭니다.", 409);

  const p = await parse(req, Body);
  if (!p.ok) return p.res;

  if (CODE && !sameCode(p.data.code)) {
    return fail("bad_code", "가입 코드가 맞지 않습니다.", 403);
  }

  const weak = checkPasswordStrength(p.data.password);
  if (weak) return fail("weak_password", weak, 422);

  const email = p.data.email.trim().toLowerCase();
  /* 이미 있는 메일이면 거절한다. "있다/없다" 가 새지만, 가입 화면에서는
     어차피 알려 주어야 한다 — 모르면 왜 안 되는지 알 수 없다 */
  if (await findByEmail(email)) {
    return fail("duplicate", "이미 쓰고 있는 메일 주소입니다. 로그인해 주세요.", 409);
  }

  const user = await createUser(email, p.data.name, p.data.password, "member");

  /* 만들고 바로 들여보낸다 — 초대 링크를 따라온 사람이 로그인 화면을
     한 번 더 만나면 거기서 그만둔다 */
  const { token, expiresAt } = await createSession(user.id);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
  });
  return ok({ user }, { status: 201 });
}
