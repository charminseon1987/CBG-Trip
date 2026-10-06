import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "가족 여행 기록",
  description: "일정 · 앨범 · 가계부를 담당 에이전트가 맡는 여행 기록 앱",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 여행일기 손글씨 글꼴 — 빌드 타임 다운로드 없이 런타임에 불러온다 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Nanum+Pen+Script&display=swap"
        />
      </head>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
