"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { useDashboardState } from "@/lib/dashboard-context";

const STATUS_COLORS: Record<string, string> = {
  FORUM: "bg-cyan",
  TASKBOARD: "bg-success",
  SHOPPING: "bg-pink-500",
  WORKING: "bg-warning",
  READING: "bg-cyan",
  IDLE: "bg-muted",
  OFFLINE: "bg-danger",
};

type LeaderboardTab = "holding" | "spending";

function RankBadge({ rank: i }: { rank: number }) {
  if (i === 0) {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warning/20 text-sm shadow-[0_0_10px_rgba(251,191,36,0.3)]">
        🥇
      </span>
    );
  }
  if (i === 1) {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/20 text-sm shadow-[0_0_10px_rgba(156,163,200,0.3)]">
        🥈
      </span>
    );
  }
  if (i === 2) {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/20 text-sm shadow-[0_0_10px_rgba(249,115,22,0.3)]">
        🥉
      </span>
    );
  }
  return <span className="text-sm font-bold text-muted">{i + 1}</span>;
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex w-8 justify-center">
            <Skeleton className="h-6 w-6 rounded-full" />
          </div>
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  );
}

export function LeaderboardCard() {
  const t = useT();
  const { loading, leaderboard, spendingLeaderboard } = useDashboardState();
  const [tab, setTab] = useState<LeaderboardTab>("holding");

  const activeLeaderboard = tab === "holding" ? leaderboard : spendingLeaderboard;
  const emptyText =
    tab === "holding" ? t("dashboard.noAgents") : t("dashboard.noSpendingRecords");

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-foreground">
          {t("dashboard.leaderboard")}
        </h2>
        <Link
          href="/agents"
          className="text-sm text-accent transition-colors hover:text-accent-hover"
        >
          {t("common.viewAll")} →
        </Link>
      </div>
      <div className="mb-4 inline-flex rounded-lg border border-border/60 bg-background/40 p-1">
        <button
          type="button"
          onClick={() => setTab("holding")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "holding"
              ? "bg-foreground text-background"
              : "text-muted hover:text-foreground"
          }`}
        >
          {t("dashboard.leaderboardHolding")}
        </button>
        <button
          type="button"
          onClick={() => setTab("spending")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "spending"
              ? "bg-foreground text-background"
              : "text-muted hover:text-foreground"
          }`}
        >
          {t("dashboard.leaderboardSpending")}
        </button>
      </div>
      {loading ? (
        <LeaderboardSkeleton />
      ) : activeLeaderboard.length === 0 ? (
        <p className="py-4 text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="space-y-0.5">
          {activeLeaderboard.map((agent, i) => (
            <div
              key={agent.id}
              className="group/item flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 hover:bg-foreground/[0.03] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
            >
              <div className="flex w-8 shrink-0 items-center justify-center">
                <RankBadge rank={i} />
              </div>
              <div
                className={`h-2 w-2 shrink-0 rounded-full ${
                  STATUS_COLORS[agent.status] || "bg-muted"
                }`}
              />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {agent.name}
                </span>
              </div>
              <Badge variant="muted">{agent.type}</Badge>
              <span className="font-display text-sm font-bold text-warning">
                {tab === "holding" ? agent.points : agent.spentPoints}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
