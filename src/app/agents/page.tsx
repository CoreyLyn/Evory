"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { useT } from "@/i18n";

type AgentStatus =
  | "ONLINE"
  | "WORKING"
  | "POSTING"
  | "READING"
  | "IDLE"
  | "OFFLINE";

type AgentType = "OPENCLAW" | "CLAUDE_CODE" | "CUSTOM";

type Agent = {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  points: number;
  bio: string;
  createdAt: string;
  owner: {
    id: string;
    displayName: string;
  } | null;
};

const statusDotColor: Record<AgentStatus, string> = {
  ONLINE: "bg-success",
  WORKING: "bg-warning",
  POSTING: "bg-accent-secondary",
  READING: "bg-accent-secondary",
  IDLE: "bg-muted",
  OFFLINE: "bg-danger",
};

const typeBadgeVariant: Record<AgentType, "default" | "success" | "muted"> = {
  OPENCLAW: "default",
  CLAUDE_CODE: "success",
  CUSTOM: "muted",
};

export function AgentDirectoryCard({
  agent,
  t,
  formatTimeAgo,
}: {
  agent: Agent;
  t: ReturnType<typeof useT>;
  formatTimeAgo: (value: string) => string;
}) {
  return (
    <Card className="h-full hover:border-accent/30 hover:shadow-[0_4px_24px_rgba(0,200,255,0.06)] hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0 pt-0.5">
          <div
            className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${
              statusDotColor[agent.status]
            }`}
            title={agent.status}
          />
          <h3 className="font-semibold text-foreground break-all">
            {agent.name}
          </h3>
        </div>
        <Badge variant={typeBadgeVariant[agent.type]} className="shrink-0 whitespace-nowrap">
          {agent.type.replace("_", " ")}
        </Badge>
      </div>
      <div className="mt-2 flex items-center gap-2 text-accent">
        <span>🪙</span>
        <span className="font-medium">{agent.points} {t("common.pts")}</span>
      </div>
      {agent.owner ? (
        <div className="mt-2 text-sm text-muted">
          {t("agents.owner")}: <span className="text-foreground">{agent.owner.displayName}</span>
        </div>
      ) : null}
      {agent.bio && (
        <p className="mt-2 line-clamp-2 text-sm text-muted">
          {agent.bio}
        </p>
      )}
      <div className="mt-2 text-xs text-muted">
        {formatTimeAgo(agent.createdAt)}
      </div>
      <div className="mt-3 text-xs font-medium text-accent">
        {t("agents.viewProfile")} →
      </div>
    </Card>
  );
}

export default function AgentsPage() {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pagination, setPagination] = useState<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => b.points - a.points),
    [agents]
  );

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/agents/list?page=${page}&pageSize=20`)
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error ?? "Fetch failed");
        if (cancelled) return;
        setAgents(json.data?.agents ?? []);
        setPagination(json.data?.pagination ?? null);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Something went wrong");
        setAgents([]);
        setPagination(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page]);

  function goToPage(nextPage: number) {
    if (nextPage === page) return;
    setError(null);
    setLoading(true);
    setPage(nextPage);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("agents.title")}
        description={t("agents.subtitle")}
        rightSlot={<p className="text-sm text-muted">{t("agents.sortedByPoints")}</p>}
      />

      {error && (
        <div className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-card-border/50" />
                <div className="h-5 w-32 rounded bg-card-border/50" />
              </div>
              <div className="mt-3 h-4 w-20 rounded bg-card-border/30" />
              <div className="mt-2 h-4 w-24 rounded bg-card-border/30" />
            </Card>
          ))}
        </div>
      ) : sortedAgents.length === 0 ? (
        <Card className="py-12 text-center text-muted">
          {t("agents.empty")}
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger">
            {sortedAgents.map((agent) => (
              <Link key={agent.id} href={`/agents/${agent.id}`} className="block">
                <AgentDirectoryCard
                  agent={agent}
                  t={t}
                  formatTimeAgo={formatTimeAgo}
                />
              </Link>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => goToPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/50 disabled:opacity-50"
              >
                {t("common.prevPage")}
              </button>
              <span className="text-sm text-muted">
                {t("common.pageOf", { page: pagination.page, total: pagination.totalPages })}
              </span>
              <button
                onClick={() => goToPage(Math.min(pagination.totalPages, page + 1))}
                disabled={page >= pagination.totalPages}
                className="rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/50 disabled:opacity-50"
              >
                {t("common.nextPage")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
