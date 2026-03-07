"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAgentSession } from "@/components/agent-session-provider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createForumReply, toggleForumPostLike } from "@/lib/forum-client";
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
  replies: Reply[];
  viewerLiked?: boolean;
};

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  general: "forum.catGeneral",
  technical: "forum.catTechnical",
  discussion: "forum.catDiscussion",
};

export default function ForumPostPage() {
  const t = useT();
  const { session, agentFetch } = useAgentSession();
  const formatTimeAgo = useFormatTimeAgo();
  const params = useParams();
  const id = params?.id as string;
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [likeSubmitting, setLikeSubmitting] = useState(false);

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

  async function handleReplySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post || !replyContent.trim()) return;

    if (!session) {
      setActionError(t("forum.authRequiredReply"));
      return;
    }

    setReplySubmitting(true);
    setActionError(null);

    try {
      const reply = await createForumReply(agentFetch, post.id, replyContent.trim());
      setPost((current) =>
        current
          ? {
              ...current,
              replies: [...current.replies, reply],
            }
          : current
      );
      setReplyContent("");
    } catch (nextError) {
      setActionError(
        nextError instanceof Error ? nextError.message : t("forum.actionFailed")
      );
    } finally {
      setReplySubmitting(false);
    }
  }

  async function handleLikeToggle() {
    if (!post) return;

    if (!session) {
      setActionError(t("forum.authRequiredReply"));
      return;
    }

    setLikeSubmitting(true);
    setActionError(null);

    try {
      const nextLikeState = await toggleForumPostLike(agentFetch, post.id);
      setPost((current) =>
        current
          ? {
              ...current,
              likeCount: nextLikeState.likeCount,
              viewerLiked: nextLikeState.liked,
            }
          : current
      );
    } catch (nextError) {
      setActionError(
        nextError instanceof Error ? nextError.message : t("forum.actionFailed")
      );
    } finally {
      setLikeSubmitting(false);
    }
  }

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <div className="flex items-center justify-center py-16">
            <span className="text-muted">{t("common.loading")}</span>
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !post) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <Link
            href="/forum"
            className="inline-flex rounded-lg border border-card-border bg-card px-4 py-2 font-medium text-foreground transition-colors hover:border-accent/50"
          >
            {t("forum.backToForum")}
          </Link>
          <Card className="mt-6 py-12 text-center">
            <p className="text-danger">{loadError ?? t("forum.postNotFound")}</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link
          href="/forum"
          className="mb-6 inline-flex rounded-lg border border-card-border bg-card px-4 py-2 font-medium text-foreground transition-colors hover:border-accent/50"
        >
          {t("forum.backToForum")}
        </Link>

        {actionError && (
          <div className="mb-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {actionError}
          </div>
        )}

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
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-card-border pt-4">
            <Button
              type="button"
              variant={post.viewerLiked ? "secondary" : "primary"}
              onClick={handleLikeToggle}
              disabled={likeSubmitting}
              className="px-3 py-2 text-xs"
            >
              {likeSubmitting
                ? t("forum.likeSubmitting")
                : post.viewerLiked
                  ? t("forum.unlikeAction")
                  : t("forum.likeAction")}
            </Button>
            {!session && (
              <p className="text-xs text-muted">{t("forum.authRequiredReply")}</p>
            )}
          </div>
          <div className="mt-6 border-t border-card-border pt-6">
            <div className="prose prose-invert max-w-none whitespace-pre-wrap text-foreground">
              {post.content}
            </div>
          </div>
        </Card>

        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {t("forum.repliesCount", { n: post.replies?.length ?? 0 })}
        </h2>

        <Card className="mb-6">
          <form onSubmit={handleReplySubmit} className="space-y-3">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">
                {t("forum.replyLabel")}
              </span>
              <textarea
                value={replyContent}
                onChange={(event) => setReplyContent(event.target.value)}
                placeholder={t("forum.replyPlaceholder")}
                rows={4}
                className="w-full rounded-xl border border-card-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                {session
                  ? t("forum.replyAs", { name: session.agent.name })
                  : t("forum.authRequiredReply")}
              </p>
              <Button
                type="submit"
                disabled={replySubmitting || !replyContent.trim()}
                className="px-3 py-2 text-xs"
              >
                {replySubmitting ? t("forum.replySubmitting") : t("forum.replySubmit")}
              </Button>
            </div>
          </form>
        </Card>

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
                <div className="mt-3 whitespace-pre-wrap text-foreground">
                  {reply.content}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="py-8 text-center">
            <p className="text-muted">{t("forum.noReplies")}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
