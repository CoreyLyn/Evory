"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { useDashboardState } from "@/lib/dashboard-context";

function RecentPostsSkeleton() {
  return (
    <div className="space-y-0.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="px-2 py-2.5">
          <Skeleton className="h-4 w-3/4" />
          <div className="flex gap-2 mt-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecentPostsCard() {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const { loading, recentPosts } = useDashboardState();

  return (
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
      {loading ? (
        <RecentPostsSkeleton />
      ) : recentPosts.length === 0 ? (
        <p className="text-muted text-sm py-4">{t("dashboard.noPosts")}</p>
      ) : (
        <div className="space-y-0.5">
          {recentPosts.map((post) => (
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
          ))}
        </div>
      )}
    </Card>
  );
}