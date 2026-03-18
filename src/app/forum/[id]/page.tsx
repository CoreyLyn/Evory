"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MarkdownContent } from "@/components/content/markdown-content";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export function ForumPostDetailContent({
  post,
  t,
  formatTimeAgo,
}: {
  post: Post;
  t: ReturnType<typeof useT>;
  formatTimeAgo: ReturnType<typeof useFormatTimeAgo>;
}) {
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

  return (
    <>
      <Card className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {post.title}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium text-accent-secondary">
            {post.agent?.name ?? t("common.anonymous")}
          </span>
          <Badge variant={getAgentTypeBadgeVariant(post.agent?.type ?? "")}>
            {post.agent?.type ?? "agent"}
          </Badge>
          <Badge variant={getCategoryBadgeVariant(post.category)}>
            {CATEGORY_LABEL_KEYS[post.category] ? t(CATEGORY_LABEL_KEYS[post.category]) : post.category}
          </Badge>
          <span className="text-muted">
            {formatTimeAgo(post.createdAt)}
          </span>
          <span className="text-muted">{post.viewCount} {t("common.views")}</span>
          <span className="text-muted">{post.likeCount} {t("forum.likes")}</span>
        </div>
        {post.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Badge key={tag.slug} variant={getTagBadgeVariant(tag.kind)}>
                {tag.label}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-6 border-t border-card-border pt-6">
          <MarkdownContent content={post.content} />
        </div>
      </Card>

      <h2 className="mb-4 text-lg font-semibold text-foreground">
        {t("forum.repliesCount", { n: post.replies?.length ?? 0 })}
      </h2>

      {post.replies && post.replies.length > 0 ? (
        <div className="space-y-4 stagger">
          {post.replies.map((reply) => (
            <Card
              key={reply.id}
              className="border-l-4 border-l-accent-secondary/50"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-accent-secondary">
                  {reply.agent?.name ?? t("common.anonymous")}
                </span>
                <Badge variant={getAgentTypeBadgeVariant(reply.agent?.type ?? "")}>
                  {reply.agent?.type ?? "agent"}
                </Badge>
                <span className="text-muted">
                  {formatTimeAgo(reply.createdAt)}
                </span>
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
        <Card className="py-8 text-center">
          <p className="text-muted">{t("forum.noReplies")}</p>
        </Card>
      )}
    </>
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

  useEffect(() => {
    if (!id) return;
    async function fetchPost() {
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
    }
    fetchPost();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl flex items-center justify-center py-16">
        <span className="text-muted">{t("common.loading")}</span>
      </div>
    );
  }

  if (loadError || !post) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Link
            href="/forum"
            className="inline-flex rounded-lg border border-card-border bg-card px-4 py-2 font-medium text-foreground transition-colors hover:border-accent/50"
          >
            {t("forum.backToForum")}
          </Link>
        </div>
        <Card className="py-12 text-center">
          <p className="text-danger">{loadError ?? t("forum.postNotFound")}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in-up">
      <div>
        <Link
          href="/forum"
          className="inline-flex rounded-lg border border-card-border bg-card px-4 py-2 font-medium text-foreground transition-colors hover:border-accent/50"
        >
          {t("forum.backToForum")}
        </Link>
      </div>
      <ForumPostDetailContent post={post} t={t} formatTimeAgo={formatTimeAgo} />
    </div>
  );
}
