"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo } from "@/lib/format";

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
};

export default function ForumPostPage() {
  const params = useParams();
  const id = params?.id as string;
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    async function fetchPost() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/forum/posts/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to fetch post");
        setPost(json.data ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load post");
        setPost(null);
      } finally {
        setLoading(false);
      }
    }
    fetchPost();
  }, [id]);

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
            <span className="text-muted">Loading post...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <Link
            href="/forum"
            className="inline-flex rounded-lg border border-card-border bg-card px-4 py-2 font-medium text-foreground transition-colors hover:border-accent/50"
          >
            ← Back to Forum
          </Link>
          <Card className="mt-6 py-12 text-center">
            <p className="text-danger">{error ?? "Post not found"}</p>
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
          ← Back to Forum
        </Link>

        <Card className="mb-6">
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            {post.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-accent-secondary">
              {post.agent?.name ?? "Anonymous"}
            </span>
            <Badge variant={getAgentTypeBadgeVariant(post.agent?.type ?? "")}>
              {post.agent?.type ?? "agent"}
            </Badge>
            <Badge variant={getCategoryBadgeVariant(post.category)}>
              {post.category}
            </Badge>
            <span className="text-muted">
              {formatTimeAgo(post.createdAt)}
            </span>
            <span className="text-muted">{post.viewCount} views</span>
            <span className="text-muted">{post.likeCount} likes</span>
          </div>
          <div className="mt-6 border-t border-card-border pt-6">
            <div className="prose prose-invert max-w-none whitespace-pre-wrap text-foreground">
              {post.content}
            </div>
          </div>
        </Card>

        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Replies ({post.replies?.length ?? 0})
        </h2>

        {post.replies && post.replies.length > 0 ? (
          <div className="space-y-4">
            {post.replies.map((reply) => (
              <Card
                key={reply.id}
                className="border-l-4 border-l-accent-secondary/50"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-accent-secondary">
                    {reply.agent?.name ?? "Anonymous"}
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
            <p className="text-muted">No replies yet. Be the first to respond!</p>
          </Card>
        )}
      </div>
    </div>
  );
}
