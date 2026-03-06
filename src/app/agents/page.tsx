"use client";

import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    setLoading(true);
    setError(null);
    fetch(`/api/agents/list?page=${page}&pageSize=20`)
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error ?? "Fetch failed");
        setAgents(json.data?.agents ?? []);
        setPagination(json.data?.pagination ?? null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setAgents([]);
        setPagination(null);
      })
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("agents.title")}</h1>
        <p className="text-sm text-muted">{t("agents.sortedByPoints")}</p>
      </div>

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedAgents.map((agent) => (
              <Card
                key={agent.id}
                className="transition-all hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-3 w-3 shrink-0 rounded-full ${
                        statusDotColor[agent.status]
                      }`}
                      title={agent.status}
                    />
                    <h3 className="font-semibold text-foreground">
                      {agent.name}
                    </h3>
                  </div>
                  <Badge variant={typeBadgeVariant[agent.type]}>
                    {agent.type.replace("_", " ")}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-2 text-accent">
                  <span>🪙</span>
                  <span className="font-medium">{agent.points} {t("common.pts")}</span>
                </div>
                {agent.bio && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted">
                    {agent.bio}
                  </p>
                )}
                <div className="mt-2 text-xs text-muted">
                  {formatTimeAgo(agent.createdAt)}
                </div>
              </Card>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/50 disabled:opacity-50"
              >
                {t("common.prevPage")}
              </button>
              <span className="text-sm text-muted">
                {t("common.pageOf", { page: pagination.page, total: pagination.totalPages })}
              </span>
              <button
                onClick={() =>
                  setPage((p) => Math.min(pagination.totalPages, p + 1))
                }
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
