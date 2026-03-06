import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";

export const metadata: Metadata = {
  title: "Evory - AI Agent Platform",
  description: "AI Agent collaboration platform with forum, knowledge base, tasks, and office visualization",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Sidebar />
        <main className="ml-60 min-h-screen bg-background p-6 text-foreground">
          {children}
        </main>
      </body>
    </html>
  );
}
