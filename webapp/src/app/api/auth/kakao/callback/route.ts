import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { COOKIE, createKakaoUser, createSession, findByKakao } from "@/lib/auth";
import { STATE_COOKIE, exchange, kakaoReady, redirectUri, whoIs } from "@/lib/kakao";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** 로그인 화면으로 돌려보내며 까닭을 말한다. 쪽지 쿠키는 치운다 */
function back(req: Request, err: string) {
  const to = new URL("/login", req.url);
  to.searchParams.set("err", err);
  const res = NextResponse.redirect(to);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/** GET /api/auth/kakao/callback — 카카오가 코드를 들고 여기로 돌려보낸다 */
export async function GET(req: Request) {
  if (!kakaoReady()) return back(req, "카카오 로그인이 설정되지 않았습니다.");

  const q = new URL(req.url).searchParams;
  /* 사용자가 동의 화면에서 취소하면 code 없이 error 만 온다 */
  if (q.get("error")) return back(req, "카카오 로그인을 취소했습니다.");

  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) return back(req, "카카오 응답이 올바르지 않습니다.");

  /* 내가 보낸 요청이 맞는가. 쿠키의 쪽지와 주소의 쪽지가 같아야 한다 */
  const saved = req.headers.get("cookie")?.match(/(?:^|;\s*)kakao_state=([^;]*)/)?.[1];
  if (!saved) return back(req, "로그인이 너무 오래 걸렸습니다. 다시 눌러 주세요.");
  const [want, next = "/"] = decodeURIComponent(saved).split("|");
  if (!want || !same(want, state)) return back(req, "로그인 요청이 맞지 않습니다. 다시 눌러 주세요.");

  let me;
  try {
    me = await whoIs(await exchange(code, redirectUri(req)));
  } catch (e) {
    return back(req, e instanceof Error ? e.message : "카카오와 이야기하지 못했습니다.");
  }

  /* 있으면 그 사람, 없으면 새로 만든다.
     권한은 늘 member — 관리자 자리는 SETUP_CODE 를 아는 사람만이다. */
  const user = (await findByKakao(me.id)) ?? (await createKakaoUser(me.id, me.name, me.email));

  const { token, expiresAt } = await createSession(user.id);
  /* 돌아갈 곳은 "/" 로 시작하는 우리 주소만 — 바깥으로 튕기지 않게 */
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const res = NextResponse.redirect(new URL(safe, req.url));
  res.cookies.set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
  });
  res.cookies.delete(STATE_COOKIE);
  return res;
}
