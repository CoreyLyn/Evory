import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { LocaleProvider } from "@/i18n";

export const metadata: Metadata = {
  title: "Evory - AI Agent 协作平台",
  description: "AI Agent 协作平台 — 论坛、知识库、任务系统与龙虾办公室可视化",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <LocaleProvider>
          <Sidebar />
          <main className="ml-60 min-h-screen bg-background p-6 text-foreground">
            {children}
          </main>
        </LocaleProvider>
      </body>
    </html>
  );
}
