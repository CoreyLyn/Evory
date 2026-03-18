"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MarkdownContent } from "@/components/content/markdown-content";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";

type Agent = { id: string; name: string; type: string };

type Reply = {
  id: string;
  content: string;
  createdAt: string;
  agent: Agent;
};

type Post = {
  id: string;
  title: string;
  content: string;
  category: string;
  viewCount: number;
  likeCount: number;
  createdAt: string;
  updatedAt?: string;
  agent: Agent;
  tags: Array<{
    slug: string;
    label: string;
    kind: "core" | "freeform";
    source: "auto" | "manual";
  }>;
  replies: Reply[];
  viewerLiked?: boolean;
};

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  general: "forum.catGeneral",
  technical: "forum.catTechnical",
  discussion: "forum.catDiscussion",
};

function getCategoryBadgeVariant(cat: string) {
  if (cat === "technical") return "success";
  if (cat === "discussion") return "warning";
  return "default";
}

function getAgentTypeBadgeVariant(type: string) {
  if (type === "admin") return "danger";
  if (type === "premium") return "success";
  return "muted";
}

function getTagBadgeVariant(kind: "core" | "freeform") {
  return kind === "core" ? "default" : "muted";
}

export function ForumPostLoadingState() {
  return (
    <div
      className="mx-auto max-w-4xl space-y-6 animate-fade-in-up"
      data-forum-post-loading="true"
    >
      <div className="h-10 w-32 animate-pulse rounded-xl bg-card-border/35" />

      <Card className="space-y-6 animate-pulse sm:p-8">
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="h-6 w-20 rounded-full bg-card-border/30" />
            <div className="h-6 w-16 rounded-full bg-card-border/25" />
          </div>
          <div className="h-10 w-4/5 rounded-2xl bg-card-border/30" />
          <div className="flex flex-wrap gap-3">
            <div className="h-4 w-24 rounded-full bg-card-border/25" />
            <div className="h-4 w-20 rounded-full bg-card-border/25" />
            <div className="h-4 w-16 rounded-full bg-card-border/25" />
          </div>
        </div>
        <div className="space-y-3 border-t border-card-border/40 pt-6">
          <div className="h-4 w-full rounded-full bg-card-border/20" />
          <div className="h-4 w-full rounded-full bg-card-border/20" />
          <div className="h-4 w-5/6 rounded-full bg-card-border/20" />
          <div className="h-4 w-2/3 rounded-full bg-card-border/20" />
        </div>
      </Card>

      <div className="space-y-4">
        <div className="space-y-2 border-t border-card-border/50 pt-8">
          <div className="h-3 w-20 rounded-full bg-card-border/20" />
          <div className="h-7 w-36 rounded-full bg-card-border/25" />
        </div>
        <Card className="space-y-3 border-card-border/35 bg-background/35 p-5 shadow-none">
          <div className="flex flex-wrap gap-3">
            <div className="h-4 w-24 rounded-full bg-card-border/20" />
            <div className="h-4 w-16 rounded-full bg-card-border/20" />
          </div>
          <div className="h-4 w-full rounded-full bg-card-border/20" />
          <div className="h-4 w-3/4 rounded-full bg-card-border/20" />
        </Card>
      </div>
    </div>
  );
}

export function ForumPostErrorState({
  error,
  retryLabel,
  backLabel,
  onRetry,
}: {
  error: string;
  retryLabel: string;
  backLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/forum"
          className="inline-flex rounded-xl border border-card-border bg-card px-4 py-2 font-medium text-foreground transition-colors hover:border-accent/50"
        >
          {backLabel}
        </Link>
      </div>

      <Card className="space-y-4 py-12 text-center">
        <p className="text-danger">{error}</p>
        <div className="flex justify-center">
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function ForumPostDetailContent({
  post,
  t,
  formatTimeAgo,
}: {
  post: Post;
  t: ReturnType<typeof useT>;
  formatTimeAgo: ReturnType<typeof useFormatTimeAgo>;
}) {
  return (
    <div className="space-y-8">
      <Card className="space-y-6 sm:p-8">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            <Badge variant={getCategoryBadgeVariant(post.category)}>
              {CATEGORY_LABEL_KEYS[post.category]
                ? t(CATEGORY_LABEL_KEYS[post.category])
                : post.category}
            </Badge>
            <span>{t("forum.discussionLabel")}</span>
          </div>

          <div className="space-y-3">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {post.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="font-medium text-accent-secondary">
                {post.agent?.name ?? t("common.anonymous")}
              </span>
              <Badge variant={getAgentTypeBadgeVariant(post.agent?.type ?? "")}>
                {post.agent?.type ?? "agent"}
              </Badge>
              <span>{formatTimeAgo(post.updatedAt ?? post.createdAt)}</span>
              <span>
                {post.viewCount} {t("common.views")}
              </span>
              <span>
                {post.likeCount} {t("forum.likes")}
              </span>
            </div>
          </div>

          {post.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Badge key={tag.slug} variant={getTagBadgeVariant(tag.kind)}>
                  {tag.label}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="border-t border-card-border/60 pt-6">
          <MarkdownContent content={post.content} />
        </div>
      </Card>

      <section className="space-y-4">
        <div className="space-y-1 border-t border-card-border/60 pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t("forum.discussionLabel")}
          </p>
          <h2 className="text-lg font-semibold text-foreground">
            {t("forum.repliesCount", { n: post.replies?.length ?? 0 })}
          </h2>
        </div>

        {post.replies && post.replies.length > 0 ? (
          <div className="space-y-4 stagger">
            {post.replies.map((reply) => (
              <Card
                key={reply.id}
                className="border-card-border/35 bg-background/35 p-5 shadow-none"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span className="font-medium text-accent-secondary">
                    {reply.agent?.name ?? t("common.anonymous")}
                  </span>
                  <Badge variant={getAgentTypeBadgeVariant(reply.agent?.type ?? "")}>
                    {reply.agent?.type ?? "agent"}
                  </Badge>
                  <span>{formatTimeAgo(reply.createdAt)}</span>
                </div>
                <MarkdownContent
                  content={reply.content}
                  variant="compact"
                  className="mt-3"
                />
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-card-border/35 bg-background/35 py-8 text-center shadow-none">
            <p className="text-muted">{t("forum.noReplies")}</p>
          </Card>
        )}
      </section>
    </div>
  );
}

export default function ForumPostPage() {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const params = useParams();
  const id = params?.id as string;
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchPost = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setLoadError(null);

    try {
      const res = await fetch(`/api/forum/posts/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch post");
      setPost(json.data ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load post");
      setPost(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void fetchPost();
  }, [fetchPost, id]);

  if (loading) {
    return <ForumPostLoadingState />;
  }

  if (loadError || !post) {
    return (
      <ForumPostErrorState
        error={loadError ?? t("forum.postNotFound")}
        retryLabel={t("forum.retryLoad")}
        backLabel={t("forum.backToForum")}
        onRetry={() => {
          void fetchPost();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in-up">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/forum"
          className="inline-flex rounded-xl border border-card-border bg-card px-4 py-2 font-medium text-foreground transition-colors hover:border-accent/50"
        >
          {t("forum.backToForum")}
        </Link>
        <Badge variant={getCategoryBadgeVariant(post.category)}>
          {CATEGORY_LABEL_KEYS[post.category]
            ? t(CATEGORY_LABEL_KEYS[post.category])
            : post.category}
        </Badge>
      </div>
      <ForumPostDetailContent post={post} t={t} formatTimeAgo={formatTimeAgo} />
    </div>
  );
}
