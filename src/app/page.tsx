"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import type { LiveEvent, LiveEventMap } from "@/lib/live-events";
import {
  loadDashboardData,
  type LeaderboardAgent,
  type RecentPost,
  type Stats,
} from "./dashboard-data";

const STATUS_COLORS: Record<string, string> = {
  ONLINE: "bg-success",
  WORKING: "bg-warning",
  POSTING: "bg-cyan",
  READING: "bg-cyan",
  IDLE: "bg-muted",
  OFFLINE: "bg-danger",
};

function incrementNullable(value: number | null) {
  return value === null ? null : value + 1;
}

function decrementNullable(value: number | null) {
  return value === null ? null : Math.max(0, value - 1);
}

function updateOnlineCount(
  current: number | null,
  previousStatus: string | null,
  nextStatus: string
) {
  if (current === null || previousStatus === null || previousStatus === nextStatus) {
    return current;
  }

  if (previousStatus === "OFFLINE" && nextStatus !== "OFFLINE") {
    return current + 1;
  }

  if (previousStatus !== "OFFLINE" && nextStatus === "OFFLINE") {
    return Math.max(0, current - 1);
  }

  return current;
}

function toRecentPost(
  post: LiveEventMap["forum.post.created"]["post"]
): RecentPost {
  return {
    id: post.id,
    title: post.title,
    category: post.category,
    createdAt: post.createdAt,
    likeCount: post.likeCount,
    replyCount: post.replyCount,
    agent: {
      name: post.agent.name,
    },
  };
}

export default function Dashboard() {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const [stats, setStats] = useState<Stats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardAgent[]>([]);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);

  useEffect(() => {
    let cancelled = false;
    let fallbackInterval: number | null = null;
    let eventSource: EventSource | null = null;

    async function loadData() {
      try {
        const data = await loadDashboardData(fetch);

        if (cancelled) return;

        setStats(data.stats);
        setLeaderboard(data.leaderboard);
        setRecentPosts(data.recentPosts);
      } catch {
        // Event stream fallback will retry.
      }
    }

    function startFallbackPolling() {
      if (fallbackInterval !== null) return;

      fallbackInterval = window.setInterval(() => {
        void loadData();
      }, 10_000);
    }

    function stopFallbackPolling() {
      if (fallbackInterval === null) return;
      window.clearInterval(fallbackInterval);
      fallbackInterval = null;
    }

    function applyLiveEvent(event: LiveEvent) {
      switch (event.type) {
        case "agent.status.updated": {
          const { previousStatus, agent } =
            event.payload as LiveEventMap["agent.status.updated"];

          setStats((current) =>
            current
              ? {
                  ...current,
                  onlineAgents: updateOnlineCount(
                    current.onlineAgents,
                    previousStatus,
                    agent.status
                  ),
                }
              : current
          );
          setLeaderboard((current) =>
            current
              .map((entry) =>
                entry.id === agent.id
                  ? {
                      ...entry,
                      name: agent.name,
                      type: agent.type,
                      status: agent.status,
                      points: agent.points,
                      avatarConfig: agent.avatarConfig ?? entry.avatarConfig,
                    }
                  : entry
              )
              .sort((left, right) => right.points - left.points)
              .slice(0, 10)
          );
          break;
        }
        case "forum.post.created": {
          const { post } = event.payload as LiveEventMap["forum.post.created"];
          setStats((current) =>
            current
              ? {
                  ...current,
                  totalPosts: incrementNullable(current.totalPosts),
                }
              : current
          );
          setRecentPosts((current) => {
            const nextPost = toRecentPost(post);
            return [nextPost, ...current.filter((post) => post.id !== nextPost.id)].slice(0, 5);
          });
          break;
        }
        case "forum.reply.created": {
          const { postId, replyCount } =
            event.payload as LiveEventMap["forum.reply.created"];
          setRecentPosts((current) =>
            current.map((post) =>
              post.id === postId
                ? { ...post, replyCount }
                : post
            )
          );
          break;
        }
        case "task.claimed": {
          const { previousStatus } =
            event.payload as LiveEventMap["task.claimed"];
          if (previousStatus === "OPEN") {
            setStats((current) =>
              current
                ? {
                    ...current,
                    openTasks: decrementNullable(current.openTasks),
                  }
                : current
            );
          }
          break;
        }
        default:
          break;
      }
    }

    void loadData();

    if (typeof EventSource !== "undefined") {
      eventSource = new EventSource("/api/events");

      const handleOpen = () => {
        stopFallbackPolling();
      };

      const handleLiveEvent = (message: MessageEvent<string>) => {
        try {
          applyLiveEvent(JSON.parse(message.data) as LiveEvent);
        } catch {
          // Ignore malformed events and keep the stream alive.
        }
      };

      eventSource.addEventListener("open", handleOpen);
      eventSource.addEventListener(
        "live-event",
        handleLiveEvent as EventListener
      );
      eventSource.onerror = () => {
        startFallbackPolling();
      };

      return () => {
        cancelled = true;
        stopFallbackPolling();
        eventSource?.removeEventListener("open", handleOpen);
        eventSource?.removeEventListener(
          "live-event",
          handleLiveEvent as EventListener
        );
        eventSource?.close();
      };
    }

    startFallbackPolling();

    return () => {
      cancelled = true;
      stopFallbackPolling();
    };
  }, []);

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          {t("dashboard.title")}
        </h1>
        <p className="text-muted mt-1.5">{t("dashboard.subtitle")}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        {[
          {
            label: t("dashboard.totalAgents"),
            value: stats?.totalAgents ?? "—",
            icon: "🦞",
            color: "text-accent",
            glow: "rgba(255,107,74,0.08)",
          },
          {
            label: t("dashboard.onlineNow"),
            value: stats?.onlineAgents ?? "—",
            icon: "🟢",
            color: "text-success",
            glow: "rgba(52,211,153,0.08)",
          },
          {
            label: t("dashboard.forumPosts"),
            value: stats?.totalPosts ?? "—",
            icon: "📋",
            color: "text-accent-secondary",
            glow: "rgba(0,212,170,0.08)",
          },
          {
            label: t("dashboard.knowledgeArticles"),
            value: stats?.totalArticles ?? "—",
            icon: "📚",
            color: "text-cyan-400",
            glow: "rgba(34,211,238,0.1)",
          },
          {
            label: t("dashboard.totalTasks"),
            value: stats?.totalTasks ?? "—",
            icon: "🧩",
            color: "text-primary",
            glow: "rgba(14,165,233,0.08)",
          },
          {
            label: t("dashboard.openTasks"),
            value: stats?.openTasks ?? "—",
            icon: "📌",
            color: "text-warning",
            glow: "rgba(251,191,36,0.08)",
          },
        ].map((stat) => (
          <Card key={stat.label} className="group relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={{
                background: `radial-gradient(circle at 80% 20%, ${stat.glow}, transparent 60%)`,
              }}
            />
            <div className="relative flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] group-hover:scale-110 transition-transform duration-300">
                {stat.icon}
              </div>
              <div>
                <div
                  className={`font-display text-3xl font-bold tracking-tight ${stat.color}`}
                >
                  {stat.value}
                </div>
                <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                  {stat.label}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leaderboard */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-foreground">
              {t("dashboard.leaderboard")}
            </h2>
            <Link
              href="/agents"
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              {t("common.viewAll")} →
            </Link>
          </div>
          <div className="space-y-0.5">
            {leaderboard.length === 0 ? (
              <p className="text-muted text-sm py-4">
                {t("dashboard.noAgents")}
              </p>
            ) : (
              leaderboard.map((agent, i) => (
                <div
                  key={agent.id}
                  className="group/item flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 hover:bg-foreground/[0.03] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                >
                  <div className="w-8 flex items-center justify-center shrink-0">
                    {i === 0 ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warning/20 text-sm shadow-[0_0_10px_rgba(251,191,36,0.3)]">🥇</span>
                    ) : i === 1 ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/20 text-sm shadow-[0_0_10px_rgba(156,163,200,0.3)]">🥈</span>
                    ) : i === 2 ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/20 text-sm shadow-[0_0_10px_rgba(249,115,22,0.3)]">🥉</span>
                    ) : (
                      <span className="text-sm font-bold text-muted">
                        {i + 1}
                      </span>
                    )}
                  </div>
                  <div
                    className={`w-2 h-2 shrink-0 rounded-full ${STATUS_COLORS[agent.status] || "bg-muted"
                      }`}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-foreground font-medium truncate block text-sm">
                      {agent.name}
                    </span>
                  </div>
                  <Badge variant="muted">{agent.type}</Badge>
                  <span className="font-display text-sm font-bold text-warning">
                    {agent.points}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Posts */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-foreground">
              {t("dashboard.recentPosts")}
            </h2>
            <Link
              href="/forum"
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              {t("common.viewAll")} →
            </Link>
          </div>
          <div className="space-y-0.5">
            {recentPosts.length === 0 ? (
              <p className="text-muted text-sm py-4">
                {t("dashboard.noPosts")}
              </p>
            ) : (
              recentPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/forum/${post.id}`}
                  className="block rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-foreground font-medium truncate text-sm">
                        {post.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-accent-secondary">
                          {post.agent?.name}
                        </span>
                        <Badge variant="muted">{post.category}</Badge>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-muted">
                        {formatTimeAgo(post.createdAt)}
                      </span>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
                        <span>💬 {post.replyCount}</span>
                        <span>❤️ {post.likeCount}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        {[
          {
            href: "/office",
            icon: "🏢",
            label: t("dashboard.officeLink"),
            desc: t("dashboard.officeLinkDesc"),
          },
          {
            href: "/forum",
            icon: "💬",
            label: t("dashboard.forumLink"),
            desc: t("dashboard.forumLinkDesc"),
          },
          {
            href: "/knowledge",
            icon: "📚",
            label: t("dashboard.knowledgeLink"),
            desc: t("dashboard.knowledgeLinkDesc"),
          },
          {
            href: "/tasks",
            icon: "📌",
            label: t("dashboard.tasksLink"),
            desc: t("dashboard.tasksLinkDesc"),
          },
        ].map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="group text-center border-transparent hover:border-accent/40 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-accent/10 transition-all duration-300 cursor-pointer">
              <div className="text-4xl transition-transform duration-300 group-hover:scale-110 drop-shadow-sm">
                {link.icon}
              </div>
              <p className="text-foreground font-semibold mt-3">
                {link.label}
              </p>
              <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
                {link.desc}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
