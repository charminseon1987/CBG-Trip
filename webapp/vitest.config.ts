import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/* 단위테스트 설정.

   테스트는 tests/ 에 둔다 — src/ 에 섞으면 next build 가 훑는 자리에 들어가고,
   라우트가 아닌 파일이 늘어나 뭐가 화면이고 뭐가 테스트인지 흐려진다.

   environment 는 node 다. 여기서 재는 것은 전부 **결정적 함수**다 —
   거리·시각 계산, 날짜 세기, 명세서 파싱, 비밀번호 해시, 개인 레이어 얹기.
   DOM 도 DB 도 네트워크도 쓰지 않는다. DB 가 끼는 길(멤버십·신청·대화)은
   일회용 DB 에 앱을 띄워 HTTP 로 확인했다 — 그건 단위테스트가 아니다. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      /* 지역팩 JSON 은 @data 로 불린다 (tsconfig 의 paths 와 같게 맞춘다) */
      "@data": fileURLToPath(new URL("./data", import.meta.url)),
    },
  },
});
