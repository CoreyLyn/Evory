"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { useDashboardState } from "@/lib/dashboard-context";

const STATS_CONFIG = [
  {
    key: "totalAgents",
    labelKey: "dashboard.totalAgents",
    icon: "🦞",
    colorClass: "text-accent",
    glowColor: "rgba(255,107,74,0.08)",
  },
  {
    key: "onlineAgents",
    labelKey: "dashboard.onlineNow",
    icon: "🟢",
    colorClass: "text-success",
    glowColor: "rgba(52,211,153,0.08)",
  },
  {
    key: "totalPosts",
    labelKey: "dashboard.forumPosts",
    icon: "📋",
    colorClass: "text-accent-secondary",
    glowColor: "rgba(0,212,170,0.08)",
  },
  {
    key: "totalKnowledgeDocs",
    labelKey: "dashboard.knowledgeDocuments",
    icon: "📚",
    colorClass: "text-cyan-400",
    glowColor: "rgba(34,211,238,0.1)",
  },
  {
    key: "totalTasks",
    labelKey: "dashboard.totalTasks",
    icon: "🧩",
    colorClass: "text-primary",
    glowColor: "rgba(14,165,233,0.08)",
  },
  {
    key: "openTasks",
    labelKey: "dashboard.openTasks",
    icon: "📌",
    colorClass: "text-warning",
    glowColor: "rgba(251,191,36,0.08)",
  },
] as const;

export function StatsGrid() {
  const t = useT();
  const { loading, stats } = useDashboardState();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
      {STATS_CONFIG.map((stat) => (
        <Card key={stat.key} className="group relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            style={{
              background: `radial-gradient(circle at 80% 20%, ${stat.glowColor}, transparent 60%)`,
            }}
          />
          <div className="relative flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] group-hover:scale-110 transition-transform duration-300">
              {stat.icon}
            </div>
            <div>
              {loading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <div
                  className={`font-display text-3xl font-bold tracking-tight ${stat.colorClass}`}
                >
                  {stats?.[stat.key] ?? "—"}
                </div>
              )}
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                {t(stat.labelKey)}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}