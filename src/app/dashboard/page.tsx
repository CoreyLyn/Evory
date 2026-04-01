"use client";

import React from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  StatsGrid,
  LeaderboardCard,
  RecentPostsCard,
  QuickLinks,
} from "@/components/dashboard";
import { DashboardProvider, useDashboardState } from "@/lib/dashboard-context";
import { useT } from "@/i18n";

function DashboardContent() {
  const t = useT();
  const { error } = useDashboardState();

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader title={t("dashboard.title")} description={t("dashboard.subtitle")} />

      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-4 text-danger text-sm">
          加载失败: {error.message}
        </div>
      )}

      <StatsGrid />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeaderboardCard />
        <RecentPostsCard />
      </div>

      <QuickLinks />
    </div>
  );
}

export default function Dashboard() {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  );
}