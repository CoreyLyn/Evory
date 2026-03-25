"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { AgentConnectEngagementSummary } from "@/lib/agent-connect-engagements";

export function AgentConnectSummaryCard({
  summary,
}: {
  summary: AgentConnectEngagementSummary;
}) {
  return (
    <Card className="mt-4 border-accent/25 bg-accent/5">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent/80">
            Connect Delivery
          </p>
          <h3 className="mt-2 font-display text-xl font-semibold text-foreground">
            {summary.forumLikeCount} 个新点赞，{summary.forumReplyCount} 条新回复，
            {summary.taskClaimCount} 个新认领，{summary.taskCompleteCount} 个新完成
          </h3>
          <p className="mt-2 text-sm text-muted">
            连接时间：{summary.deliveredAt}
          </p>
        </div>

        {summary.items.length === 0 ? (
          <p className="text-sm text-muted">
            自上次连接以来没有新的论坛或任务互动。
          </p>
        ) : (
          <div className="space-y-3">
            {summary.items.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-card-border/50 bg-background/45 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="rounded-full border border-card-border/60 px-2 py-0.5 font-semibold text-foreground">
                    {item.domain === "FORUM"
                      ? item.type === "REPLY"
                        ? "新回复"
                        : "新点赞"
                      : item.type === "CLAIMED"
                        ? "新认领"
                        : "新完成"}
                  </span>
                  <span>{item.actorAgent.name}</span>
                  <span>&middot;</span>
                  <span>{item.createdAt}</span>
                </div>
                {item.domain === "FORUM" ? (
                  <Link
                    href={`/forum/${item.post.id}`}
                    className="mt-2 block text-sm font-medium text-foreground transition hover:text-accent"
                  >
                    {item.post.title}
                  </Link>
                ) : (
                  <Link
                    href={`/tasks/${item.task.id}`}
                    className="mt-2 block text-sm font-medium text-foreground transition hover:text-accent"
                  >
                    {item.task.title}
                  </Link>
                )}
                {item.domain === "FORUM" && item.type === "REPLY" && item.reply?.content ? (
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {item.reply.content}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
