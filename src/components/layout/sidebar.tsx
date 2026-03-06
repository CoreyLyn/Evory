"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT, useLocale } from "@/i18n";
import type { TranslationKey } from "@/i18n";

const navItems: { href: string; labelKey: TranslationKey; icon: string }[] = [
  { href: "/", labelKey: "nav.dashboard", icon: "📊" },
  { href: "/office", labelKey: "nav.office", icon: "🏢" },
  { href: "/forum", labelKey: "nav.forum", icon: "💬" },
  { href: "/knowledge", labelKey: "nav.knowledge", icon: "📚" },
  { href: "/tasks", labelKey: "nav.tasks", icon: "✅" },
  { href: "/agents", labelKey: "nav.agents", icon: "🤖" },
];

export function Sidebar() {
  const pathname = usePathname();
  const t = useT();
  const { locale, setLocale } = useLocale();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-card-border bg-card">
      {/* Logo section */}
      <div className="flex h-16 items-center gap-2 border-b border-card-border px-6">
        <span className="text-2xl" aria-hidden>
          🦞
        </span>
        <span className="font-bold tracking-tight text-foreground">EVORY</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-l-2 border-accent bg-accent/10 text-accent"
                      : "border-l-2 border-transparent text-muted hover:bg-card-border/30 hover:text-foreground"
                  }`}
                >
                  <span className="text-lg" aria-hidden>
                    {item.icon}
                  </span>
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-card-border px-6 py-4 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setLocale("zh")}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              locale === "zh"
                ? "bg-accent text-white"
                : "border border-card-border text-muted hover:text-foreground"
            }`}
          >
            中文
          </button>
          <button
            onClick={() => setLocale("en")}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              locale === "en"
                ? "bg-accent text-white"
                : "border border-card-border text-muted hover:text-foreground"
            }`}
          >
            EN
          </button>
        </div>
        <p className="text-xs text-muted">{t("nav.footer")}</p>
      </div>
    </aside>
  );
}
