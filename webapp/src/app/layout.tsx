import type { Metadata } from "next";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://cbg-trip.vercel.app"),
  applicationName: "Family Trip Log",
  title: { default: "Family Trip Log", template: "%s · Family Trip Log" },
  description: "일정·사진·가계부·여행일기를 냥이들이 챙겨 주는 우리 여행 기록.",
  openGraph: {
    siteName: "Family Trip Log",
    type: "website",
    locale: "ko_KR",
  },
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
      <body className="min-h-full antialiased">
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
