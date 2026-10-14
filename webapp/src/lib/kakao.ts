/* ============================================================
   카카오 로그인에 쓰는 것들. 라우트 둘이 같이 쓴다.

   왜 카카오인가 — 같이 여행 간 사람을 초대하려면 그 사람이 들어올 수 있어야
   한다. 비밀번호를 새로 만들게 하면 대부분 거기서 그만둔다.

   앱 등록은 developers.kakao.com 에서 사람이 한다. 거기서 받은 값:
     KAKAO_REST_API_KEY   필수. 이게 없으면 카카오 단추를 아예 안 보여 준다
     KAKAO_CLIENT_SECRET  선택. 카카오 쪽에서 "사용함" 으로 켰다면 필수가 된다
   ============================================================ */

export const KAKAO_KEY = process.env.KAKAO_REST_API_KEY || "";
export const KAKAO_SECRET = process.env.KAKAO_CLIENT_SECRET || "";

/** 카카오로 들어올 수 있는가. 꺼져 있으면 화면이 단추를 숨긴다 */
export const kakaoReady = () => Boolean(KAKAO_KEY);

/* 돌아올 주소. 카카오에 등록한 것과 **글자 하나까지** 같아야 한다.

   요청에서 뽑아내는 이유: 배포 주소와 로컬 주소가 다르고, Vercel 의 미리보기는
   배포마다 주소가 바뀐다. 다만 Host 헤더는 부르는 쪽이 적는 값이라 그대로
   믿으면 안 된다 — 가짜 Host 를 넣어 코드를 남의 주소로 보내게 할 수 있다.
   그래서 KAKAO_REDIRECT_URI 를 적어 두었으면 그쪽이 언제나 이긴다. */
export function redirectUri(req: Request): string {
  const fixed = process.env.KAKAO_REDIRECT_URI;
  if (fixed) return fixed;
  return new URL("/api/auth/kakao/callback", new URL(req.url).origin).toString();
}

/** 들어왔다 나갔다 하는 사이에 CSRF 를 막는 쪽지. 쿠키와 주소에 같이 넣는다 */
export const STATE_COOKIE = "kakao_state";

export interface KakaoMe {
  id: string;
  name: string;
  email: string | null;
}

/** 코드를 토큰으로 바꾼다 */
export async function exchange(code: string, uri: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: KAKAO_KEY,
    redirect_uri: uri,
    code,
  });
  if (KAKAO_SECRET) body.set("client_secret", KAKAO_SECRET);

  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const d = (await res.json()) as {
    access_token?: string; error?: string; error_description?: string;
  };
  if (!res.ok || !d.access_token) {
    throw new Error(d.error_description || d.error || `토큰 교환 실패 (HTTP ${res.status})`);
  }
  return d.access_token;
}

/** 누구인지 묻는다. 이름·메일은 동의 안 하면 안 온다 — 없을 수 있다 */
export async function whoIs(token: string): Promise<KakaoMe> {
  const res = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`사용자 정보를 못 받았습니다 (HTTP ${res.status})`);
  const d = (await res.json()) as {
    id: number;
    kakao_account?: { email?: string; profile?: { nickname?: string } };
    properties?: { nickname?: string };
  };
  return {
    id: String(d.id),
    name: d.kakao_account?.profile?.nickname || d.properties?.nickname || "",
    email: d.kakao_account?.email ?? null,
  };
}
