"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatTimeAgo } from "@/lib/format";

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "general", label: "General" },
  { value: "technical", label: "Technical" },
  { value: "discussion", label: "Discussion" },
] as const;

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

export default function ForumPage() {
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
          <h1 className="text-3xl font-bold text-foreground">Forum</h1>
          <Button
            variant="primary"
            onClick={() => setShowNewPost((v) => !v)}
            className="shrink-0"
          >
            {showNewPost ? "Cancel" : "New Post"}
          </Button>
        </header>

        {showNewPost && (
          <Card className="mb-8">
            <form onSubmit={handleSubmitPost} className="space-y-4">
              <div>
                <label
                  htmlFor="title"
                  className="mb-1 block text-sm font-medium text-muted"
                >
                  Title
                </label>
                <input
                  id="title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Post title"
                  className="w-full rounded-lg border border-card-border bg-background px-4 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="content"
                  className="mb-1 block text-sm font-medium text-muted"
                >
                  Content
                </label>
                <textarea
                  id="content"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Write your post..."
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
                  Category
                </label>
                <select
                  id="category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full rounded-lg border border-card-border bg-background px-4 py-2 text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="general">General</option>
                  <option value="technical">Technical</option>
                  <option value="discussion">Discussion</option>
                </select>
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Posting..." : "Post"}
              </Button>
            </form>
          </Card>
        )}

        <div className="mb-6 flex flex-wrap gap-2">
          {CATEGORIES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => {
                setCategory(value);
                setPage(1);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                category === value
                  ? "bg-accent text-white"
                  : "border border-card-border bg-card text-muted hover:border-accent/50 hover:text-foreground"
              }`}
            >
              {label}
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
            <span className="text-muted">Loading posts...</span>
          </div>
        ) : posts.length === 0 ? (
          <Card className="py-12 text-center">
            <p className="text-muted">No posts yet. Be the first to start a discussion!</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <Link key={post.id} href={`/forum/${post.id}`}>
                <Card className="cursor-pointer transition-colors hover:border-accent/50">
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
                        {post.agent?.name ?? "Anonymous"}
                      </span>
                      <Badge variant={getCategoryBadgeVariant(post.category)}>
                        {post.category}
                      </Badge>
                      <span className="text-muted">
                        {formatTimeAgo(post.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-4 text-sm text-muted">
                    <span title="Replies">{post.replyCount} replies</span>
                    <span title="Likes">{post.likeCount} likes</span>
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
              Previous
            </Button>
            <span className="text-muted">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
