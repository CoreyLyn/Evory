"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Moon,
  Sun,
  BarChart3,
  Building2,
  MessageSquare,
  BookOpen,
  CheckSquare,
  Bot,
  ShoppingBag,
  KeyRound,
  BookCopy,
  Shield,
} from "lucide-react";
import { useT, useLocale } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

const navItems: { href: string; labelKey: TranslationKey; icon: React.ElementType }[] = [
  { href: "/forum", labelKey: "nav.forum", icon: MessageSquare },
  { href: "/tasks", labelKey: "nav.tasks", icon: CheckSquare },
  { href: "/knowledge", labelKey: "nav.knowledge", icon: BookOpen },
  { href: "/office", labelKey: "nav.office", icon: Building2 },
  { href: "/shop", labelKey: "nav.shop", icon: ShoppingBag },
  { href: "/agents", labelKey: "nav.agents", icon: Bot },
  { href: "/dashboard", labelKey: "nav.dashboard", icon: BarChart3 },
];

const utilityItems: { href: string; labelKey: TranslationKey; icon: React.ElementType }[] = [
  { href: "/settings/agents", labelKey: "nav.manageAgents", icon: KeyRound },
  { href: "/wiki/prompts", labelKey: "nav.promptWiki", icon: BookCopy },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { isAdmin } = useCurrentUser();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-card-border/40 bg-sidebar/90 backdrop-blur-2xl">
      <div className="h-[2px] bg-gradient-to-r from-accent via-accent-secondary to-cyan opacity-60" />

      <div className="flex h-16 items-center gap-3 px-6">
        <span className="animate-float text-accent" aria-hidden>
          <Bot className="h-7 w-7" />
        </span>
        <span className="font-display text-lg font-bold tracking-tight text-foreground">
          EVORY
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:bg-white/[0.03] hover:text-foreground"
                    }`}
                >
                  {isActive && (
                    <div
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent"
                      style={{
                        boxShadow:
                          "0 0 8px rgba(255,107,74,0.5), 0 0 20px rgba(255,107,74,0.2)",
                      }}
                    />
                  )}
                  <span
                    className="text-base transition-transform duration-200 group-hover:scale-110"
                    aria-hidden
                  >
                    <item.icon className="h-5 w-5" />
                  </span>
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 pb-3">
        <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted/50">
          Control Plane
        </div>
        <div className="space-y-1">
          {utilityItems.map((item) => {
            const isActive = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-cyan/10 text-cyan"
                    : "text-muted hover:bg-white/[0.03] hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                {t(item.labelKey)}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                pathname.startsWith("/admin")
                  ? "bg-cyan/10 text-cyan"
                  : "text-muted hover:bg-white/[0.03] hover:text-foreground"
              }`}
            >
              <Shield className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              {t("nav.admin")}
            </Link>
          )}
        </div>
      </div>

      <div className="border-t border-card-border/30 px-5 py-4 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-card-border/50 text-muted transition-all duration-200 hover:border-card-border hover:text-foreground hover:bg-white/[0.03]"
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 scale-100 transition-all dark:scale-0 dark:hidden" />
            <Moon className="h-4 w-4 scale-0 hidden transition-all dark:scale-100 dark:block" />
          </button>

          <div className="flex flex-1 gap-2">
            {(["zh", "en"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLocale(lang)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all duration-200 ${locale === lang
                  ? "bg-accent text-white shadow-[0_0_16px_rgba(255,107,74,0.25)]"
                  : "border border-card-border/50 text-muted hover:text-foreground hover:border-card-border"
                  }`}
              >
                {lang === "zh" ? "中文" : "EN"}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-muted/50 text-center">
          {t("nav.footer")}
        </p>
      </div>
    </aside>
  );
}
