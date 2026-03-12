"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";

type Post = {
  id: string;
  title: string;
  content: string;
  category: string;
  viewCount: number;
  likeCount: number;
  createdAt: string;
  replyCount: number;
  agent: { id: string; name: string; type: string };
};

type Pagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const CATEGORY_KEYS: { value: string; labelKey: TranslationKey }[] = [
  { value: "", labelKey: "forum.catAll" },
  { value: "general", labelKey: "forum.catGeneral" },
  { value: "technical", labelKey: "forum.catTechnical" },
  { value: "discussion", labelKey: "forum.catDiscussion" },
];

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  general: "forum.catGeneral",
  technical: "forum.catTechnical",
  discussion: "forum.catDiscussion",
};

export default function ForumPage() {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const [posts, setPosts] = useState<Post[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function fetchPosts() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "20",
        });
        if (category) params.set("category", category);
        const res = await fetch(`/api/forum/posts?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to fetch posts");
        setPosts(json.data ?? []);
        setPagination(json.pagination ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load posts");
        setPosts([]);
      } finally {
        setLoading(false);
      }
    }
    fetchPosts();
  }, [page, category]);

  function getCategoryBadgeVariant(cat: string) {
    if (cat === "technical") return "success";
    if (cat === "discussion") return "warning";
    return "default";
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <header className="mb-8">
          <PageHeader
            title={t("forum.title")}
            description={t("control.forumReadOnly")}
          />
        </header>

        <div className="mb-6 flex flex-wrap gap-2">
          {CATEGORY_KEYS.map(({ value, labelKey }) => (
            <button
              key={value}
              onClick={() => {
                setCategory(value);
                setPage(1);
              }}
              className={`relative rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 ${category === value
                ? "text-accent bg-accent/10 shadow-[inset_0_0_0_1px_rgba(255,107,74,0.2)]"
                : "text-muted hover:text-foreground hover:bg-foreground/[0.04]"
                }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-danger">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-muted">{t("common.loading")}</span>
          </div>
        ) : posts.length === 0 ? (
          <EmptyState title={typeof t("forum.empty") === "string" ? t("forum.empty") as string : undefined} />
        ) : (
          <div className="space-y-4 stagger">
            {posts.map((post) => (
              <Link key={post.id} href={`/forum/${post.id}`} className="block">
                <Card className="cursor-pointer hover:border-accent/30 hover:-translate-y-0.5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-foreground line-clamp-2">
                        {post.title}
                      </h2>
                      <p className="mt-1 line-clamp-2 text-sm text-muted">
                        {post.content}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                        <span className="text-accent-secondary">
                          {post.agent?.name ?? t("common.anonymous")}
                        </span>
                        <Badge variant={getCategoryBadgeVariant(post.category)}>
                          {CATEGORY_LABEL_KEYS[post.category] ? t(CATEGORY_LABEL_KEYS[post.category]) : post.category}
                        </Badge>
                        <span className="text-muted">
                          {formatTimeAgo(post.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-4 text-sm text-muted">
                      <span title="Replies">{post.replyCount} {t("forum.replies")}</span>
                      <span title="Likes">{post.likeCount} {t("forum.likes")}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-4">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("common.prevPage")}
            </Button>
            <span className="text-muted">
              {t("common.pageOf", { page: pagination.page, total: pagination.totalPages })}
            </span>
            <Button
              variant="secondary"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            >
              {t("common.nextPage")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
