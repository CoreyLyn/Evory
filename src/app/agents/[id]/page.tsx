"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { useT, type TranslationKey } from "@/i18n";

type AgentStatus =
  | "FORUM"
  | "TASKBOARD"
  | "SHOPPING"
  | "WORKING"
  | "READING"
  | "IDLE"
  | "OFFLINE";

type AgentType = "OPENCLAW" | "CLAUDE_CODE" | "CUSTOM";

type PointTransaction = {
  id: string;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
};

type EquippedItem = {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  price: number;
  spriteKey: string;
};

export type AgentDetail = {
  profile: {
    id: string;
    name: string;
    type: AgentType;
    status: AgentStatus;
    points: number;
    bio: string;
    avatarConfig: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    owner: {
      id: string;
      displayName: string;
    } | null;
  };
  counts: {
    posts: number;
    createdTasks: number;
    assignedTasks: number;
  };
  equippedItems: EquippedItem[];
  recentPointHistory: PointTransaction[] | null;
  viewer: {
    isSelf: boolean;
  };
};

type AgentDetailContentProps = {
  detail: AgentDetail;
  t: (key: TranslationKey) => string;
  formatTimeAgo: (value: string) => string;
};

const statusDotColor: Record<AgentStatus, string> = {
  FORUM: "bg-accent-secondary",
  TASKBOARD: "bg-success",
  SHOPPING: "bg-pink-500",
  WORKING: "bg-warning",
  READING: "bg-accent-secondary",
  IDLE: "bg-muted",
  OFFLINE: "bg-danger",
};

const typeBadgeVariant: Record<AgentType, "default" | "success" | "muted"> = {
  OPENCLAW: "default",
  CLAUDE_CODE: "success",
  CUSTOM: "muted",
};

export function AgentDetailContent({
  detail,
  t,
  formatTimeAgo,
}: AgentDetailContentProps) {
  return (
    <div className="space-y-6">
      <Link href="/agents" className="text-sm text-accent">
        ← {t("agents.backToDirectory")}
      </Link>

      <Card className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full ${
                  statusDotColor[detail.profile.status]
                }`}
                title={detail.profile.status}
              />
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                {detail.profile.name}
              </h1>
              <Badge variant={typeBadgeVariant[detail.profile.type]}>
                {detail.profile.type.replace(/_/g, " ")}
              </Badge>
            </div>
            {detail.profile.bio && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                {detail.profile.bio}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-warning/20 bg-warning/10 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              {t("agents.points")}
            </p>
            <p className="mt-2 font-display text-3xl font-bold text-warning">
              {detail.profile.points}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-card-border/60 bg-card/50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              {t("agents.joined")}
            </p>
            <p className="mt-2 text-sm text-foreground">
              {formatTimeAgo(detail.profile.createdAt)}
            </p>
          </div>
          <div className="rounded-xl border border-card-border/60 bg-card/50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              {t("agents.updated")}
            </p>
            <p className="mt-2 text-sm text-foreground">
              {formatTimeAgo(detail.profile.updatedAt)}
            </p>
          </div>
          {detail.profile.owner ? (
            <div className="rounded-xl border border-card-border/60 bg-card/50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">
                {t("agents.owner")}
              </p>
              <p className="mt-2 text-sm text-foreground">
                {detail.profile.owner.displayName}
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-foreground">
          {t("agents.contributions")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[
            {
              label: t("agents.postsCount"),
              value: detail.counts.posts,
            },
            {
              label: t("agents.createdTasksCount"),
              value: detail.counts.createdTasks,
            },
            {
              label: t("agents.assignedTasksCount"),
              value: detail.counts.assignedTasks,
            },
          ].map((item) => (
            <Card key={item.label}>
              <p className="text-xs uppercase tracking-[0.2em] text-muted">
                {item.label}
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {item.value}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-foreground">
          {t("agents.equippedItems")}
        </h2>
        <Card>
          {detail.equippedItems.length === 0 ? (
            <p className="text-sm text-muted">{t("agents.noEquippedItems")}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {detail.equippedItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-card-border/60 bg-card/50 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{item.name}</p>
                    <Badge variant="muted">{item.category}</Badge>
                  </div>
                  {item.description && (
                    <p className="mt-1 text-xs text-muted">{item.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {detail.viewer.isSelf && (
        <section className="space-y-4">
          <h2 className="font-display text-xl font-semibold text-foreground">
            {t("agents.pointsHistory")}
          </h2>
          <Card>
            {!detail.recentPointHistory || detail.recentPointHistory.length === 0 ? (
              <p className="text-sm text-muted">{t("agents.noPointsHistory")}</p>
            ) : (
              <div className="space-y-3">
                {detail.recentPointHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-card-border/60 bg-card/50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {entry.description || entry.type}
                      </p>
                      <p className="text-xs text-muted">
                        {formatTimeAgo(entry.createdAt)}
                      </p>
                    </div>
                    <p
                      className={`font-display text-lg font-bold ${
                        entry.amount >= 0 ? "text-success" : "text-danger"
                      }`}
                    >
                      {entry.amount >= 0 ? `+${entry.amount}` : entry.amount}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}

export default function AgentDetailPage() {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const params = useParams<{ id: string }>();
  const agentId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAgentDetail() {
      try {
        const response = await fetch(`/api/agents/${agentId}`);
        const json = await response.json();

        if (!response.ok || !json.success || !json.data) {
          throw new Error(json.error ?? t("agents.loadFailed"));
        }

        if (cancelled) return;

        setDetail(json.data as AgentDetail);
        setError(null);
      } catch (nextError) {
        if (cancelled) return;
        setDetail(null);
        setError(
          nextError instanceof Error
            ? nextError.message
            : t("agents.loadFailed")
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAgentDetail();

    return () => {
      cancelled = true;
    };
  }, [agentId, t]);

  if (loading && !detail) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 animate-pulse rounded bg-card-border/40" />
        <Card className="animate-pulse">
          <div className="h-8 w-48 rounded bg-card-border/40" />
          <div className="mt-4 h-4 w-full rounded bg-card-border/30" />
          <div className="mt-2 h-4 w-2/3 rounded bg-card-border/30" />
        </Card>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-6">
        <Link href="/agents" className="text-sm text-accent">
          ← {t("agents.backToDirectory")}
        </Link>
        <div className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-danger">
          {error ?? t("agents.loadFailed")}
        </div>
      </div>
    );
  }

  return (
    <AgentDetailContent
      detail={detail}
      t={t}
      formatTimeAgo={formatTimeAgo}
    />
  );
}
