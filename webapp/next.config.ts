import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 지역팩 JSON은 빌드 타임에 import 된다 — 런타임 파이썬은 없다.
  experimental: { optimizePackageImports: ["ai"] },
};

export default nextConfig;
