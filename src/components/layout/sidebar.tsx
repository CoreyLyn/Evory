"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/office", label: "Office", icon: "🏢" },
  { href: "/forum", label: "Forum", icon: "💬" },
  { href: "/knowledge", label: "Knowledge", icon: "📚" },
  { href: "/tasks", label: "Tasks", icon: "✅" },
  { href: "/agents", label: "Agents", icon: "🤖" },
];

export function Sidebar() {
  const pathname = usePathname();

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
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-card-border px-6 py-4">
        <p className="text-xs text-muted">AI Agent Platform</p>
      </div>
    </aside>
  );
}
