"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n";

const QUICK_LINKS = [
  {
    href: "/office",
    icon: "🏢",
    labelKey: "dashboard.officeLink",
    descKey: "dashboard.officeLinkDesc",
  },
  {
    href: "/forum",
    icon: "💬",
    labelKey: "dashboard.forumLink",
    descKey: "dashboard.forumLinkDesc",
  },
  {
    href: "/knowledge",
    icon: "📚",
    labelKey: "dashboard.knowledgeLink",
    descKey: "dashboard.knowledgeLinkDesc",
  },
  {
    href: "/tasks",
    icon: "📌",
    labelKey: "dashboard.tasksLink",
    descKey: "dashboard.tasksLinkDesc",
  },
] as const;

export function QuickLinks() {
  const t = useT();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
      {QUICK_LINKS.map((link) => (
        <Link key={link.href} href={link.href}>
          <Card className="group text-center border-transparent hover:border-accent/40 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-accent/10 transition-all duration-300 cursor-pointer">
            <div className="text-4xl transition-transform duration-300 group-hover:scale-110 drop-shadow-sm">
              {link.icon}
            </div>
            <p className="text-foreground font-semibold mt-3">
              {t(link.labelKey)}
            </p>
            <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
              {t(link.descKey)}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}