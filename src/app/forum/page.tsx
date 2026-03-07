"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
  const [showNewPost, setShowNewPost] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [submitting, setSubmitting] = useState(false);

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

  async function handleSubmitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/forum/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-key",
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          content: newContent.trim(),
          category: newCategory || "general",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create post");
      setShowNewPost(false);
      setNewTitle("");
      setNewContent("");
      setNewCategory("general");
      setPage(1);
      const params = new URLSearchParams({ page: "1", pageSize: "20" });
      if (category) params.set("category", category);
      const listRes = await fetch(`/api/forum/posts?${params}`);
      const listJson = await listRes.json();
      if (listRes.ok) {
        setPosts(listJson.data ?? []);
        setPagination(listJson.pagination ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create post");
    } finally {
      setSubmitting(false);
    }
  }

  function getCategoryBadgeVariant(cat: string) {
    if (cat === "technical") return "success";
    if (cat === "discussion") return "warning";
    return "default";
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">{t("forum.title")}</h1>
          <Button
            variant="primary"
            onClick={() => setShowNewPost((v) => !v)}
            className="shrink-0"
          >
            {showNewPost ? t("forum.cancel") : t("forum.newPost")}
          </Button>
        </header>

        <div
          className={`grid transition-all duration-300 ease-in-out ${showNewPost ? "grid-rows-[1fr] opacity-100 mb-8" : "grid-rows-[0fr] opacity-0 pointer-events-none"
            }`}
        >
          <div className="overflow-hidden">
            <Card>
              <form onSubmit={handleSubmitPost} className="space-y-4">
                <div>
                  <label
                    htmlFor="title"
                    className="mb-1 block text-sm font-medium text-muted"
                  >
                    {t("forum.labelTitle")}
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={t("forum.placeholderTitle")}
                    className="w-full rounded-lg border border-card-border bg-background px-4 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="content"
                    className="mb-1 block text-sm font-medium text-muted"
                  >
                    {t("forum.labelContent")}
                  </label>
                  <textarea
                    id="content"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder={t("forum.placeholderContent")}
                    rows={4}
                    className="w-full rounded-lg border border-card-border bg-background px-4 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="category"
                    className="mb-1 block text-sm font-medium text-muted"
                  >
                    {t("forum.labelCategory")}
                  </label>
                  <select
                    id="category"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full rounded-lg border border-card-border bg-background px-4 py-2 text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="general">{t("forum.catGeneral")}</option>
                    <option value="technical">{t("forum.catTechnical")}</option>
                    <option value="discussion">{t("forum.catDiscussion")}</option>
                  </select>
                </div>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t("forum.submitting") : t("forum.submit")}
                </Button>
              </form>
            </Card>
          </div>
        </div>

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
              <Link key={post.id} href={`/forum/${post.id}`}>
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
