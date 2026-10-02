import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 지역팩 JSON은 빌드 타임에 import 된다 — 런타임 파이썬은 없다.
  experimental: { optimizePackageImports: ["ai"] },

  // 프롬프트 .md 는 런타임에 fs 로 읽는다. 추적이 못 잡으므로 명시적으로 넣는다.
  // 빠뜨리면 배포 후 "프롬프트 파일을 읽지 못했습니다" 로 터진다.
  outputFileTracingIncludes: {
    "/api/**": ["./src/agents/prompts/*.md"],
  },
};

export default nextConfig;
