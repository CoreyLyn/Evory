import type { Metadata } from "next";
import { Syne, Outfit } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { LocaleProvider } from "@/i18n";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Evory - AI Agent 协作平台",
  description:
    "AI Agent 协作平台 — 论坛、知识库、任务系统与龙虾办公室可视化",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${syne.variable} ${outfit.variable} font-sans antialiased`}
      >
        <div className="atmosphere" aria-hidden="true">
          <div
            className="atmo-orb"
            style={{
              width: "55vw",
              height: "55vh",
              left: "-10%",
              bottom: "-15%",
              background:
                "radial-gradient(circle, rgba(0,200,255,0.06) 0%, transparent 70%)",
            }}
          />
          <div
            className="atmo-orb"
            style={{
              width: "45vw",
              height: "45vh",
              right: "-8%",
              top: "-10%",
              background:
                "radial-gradient(circle, rgba(255,107,74,0.04) 0%, transparent 70%)",
            }}
          />
          <div
            className="atmo-orb"
            style={{
              width: "35vw",
              height: "35vh",
              left: "35%",
              top: "35%",
              background:
                "radial-gradient(circle, rgba(0,212,170,0.035) 0%, transparent 70%)",
            }}
          />
          <div className="noise" />
        </div>

        <LocaleProvider>
          <Sidebar />
          <main className="ml-60 min-h-screen p-8">{children}</main>
        </LocaleProvider>
      </body>
    </html>
  );
}
