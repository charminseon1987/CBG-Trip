import type { CapacitorConfig } from "@capacitor/cli";

/* 이 앱은 Next.js 서버가 있어야 돈다 — 정적 번들이 아니라 살아 있는 주소를
   가리킨다. 개발 중에는 같은 와이파이의 내 컴퓨터 주소, 실제 앱에는 배포 주소를
   CAPACITOR_SERVER_URL 로 바꿔 낀다. */
const config: CapacitorConfig = {
  appId: "com.cbgtrip.app",
  appName: "Family Trip Log",
  webDir: "public",
  server: {
    url: process.env.CAPACITOR_SERVER_URL ?? "http://172.30.1.61:3000",
    /* 개발 주소가 http 라서 풀어 둔다. https 배포본에는 해당 없다 */
    cleartext: true,
  },
  plugins: {
    /* server.url 로 띄우면 fetch 가 네이티브 HTTP 로 우회돼 Set-Cookie 가
       WebView 쿠키 병에 안 담긴다 — 세션 로그인이 바로 튕기는 함정.
       이 플러그인이 네이티브 쿠키 저장소를 WebView 와 동기화한다. */
    CapacitorCookies: { enabled: true },
  },
};

export default config;
