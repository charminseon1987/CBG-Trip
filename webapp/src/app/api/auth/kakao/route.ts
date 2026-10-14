import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { KAKAO_KEY, STATE_COOKIE, kakaoReady, redirectUri } from "@/lib/kakao";

export const dynamic = "force-dynamic";

/** GET /api/auth/kakao — 카카오 동의 화면으로 보낸다 */
export async function GET(req: Request) {
  const back = new URL("/login", req.url);
  if (!kakaoReady()) {
    back.searchParams.set("err", "카카오 로그인이 설정되지 않았습니다.");
    return NextResponse.redirect(back);
  }

  /* 돌아올 때 "내가 보낸 그 요청이 맞는지" 확인할 쪽지.
     이게 없으면 남이 만든 로그인 링크로 내 계정에 남의 카카오를 붙일 수 있다. */
  const state = randomBytes(16).toString("base64url");

  /* 로그인 뒤 어디로 갈지. 바깥 주소로 튕기지 않게 "/" 로 시작하는 것만 받는다 */
  const want = new URL(req.url).searchParams.get("next") || "/";
  const next = want.startsWith("/") && !want.startsWith("//") ? want : "/";

  const to = new URL("https://kauth.kakao.com/oauth/authorize");
  to.searchParams.set("client_id", KAKAO_KEY);
  to.searchParams.set("redirect_uri", redirectUri(req));
  to.searchParams.set("response_type", "code");
  to.searchParams.set("state", state);

  const res = NextResponse.redirect(to);
  /* 쪽지와 돌아갈 곳을 한 쿠키에 같이 담는다. 10분이면 넉넉하다 */
  res.cookies.set(STATE_COOKIE, `${state}|${next}`, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  });
  return res;
}
