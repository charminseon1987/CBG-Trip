import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "가족 여행 기록",
  description: "일정 · 앨범 · 가계부를 담당 에이전트가 맡는 여행 기록 앱",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
