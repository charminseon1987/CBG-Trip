import { NextResponse, type NextRequest } from "next/server";
import { COOKIE } from "@/lib/session-cookie";

/* 로그인 없이 지나갈 수 있는 길 */
const OPEN = ["/login", "/setup", "/api/auth/", "/api/health"];

/**
 * 쿠키가 "있는지" 만 본다. 토큰이 진짜인지는 확인하지 않는다 —
 * 미들웨어는 Edge 에서 돌아 DB 를 볼 수 없기 때문이다.
 *
 * 그래서 이것은 보안 장치가 아니라 길 안내다. 아무 값이나 쿠키에 넣으면
 * 여기는 통과하지만, 그 뒤 모든 라우트가 currentUser() 와 guardTrip() 으로
 * 실제 세션을 확인하고 막는다. 보안의 책임은 전부 그쪽에 있다.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (OPEN.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (!req.cookies.get(COOKIE)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "unauthorized", message: "로그인이 필요합니다." } },
        { status: 401 },
      );
    }
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    to.searchParams.set("next", pathname);
    return NextResponse.redirect(to);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|cats/).*)"],
};
