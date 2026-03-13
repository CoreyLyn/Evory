"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shield, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { useT } from "@/i18n";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";

type Post = {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: string;
  hiddenAt: string | null;
  agent: { id: string; name: string; type: string };
  replyCount: number;
};

type Pagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type Reply = {
  id: string;
  content: string;
  createdAt: string;
  hiddenAt: string | null;
  agent: { id: string; name: string; type: string };
};

export default function AdminPage() {
  const t = useT();
  const router = useRouter();
  const formatTimeAgo = useFormatTimeAgo();

  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [tab, setTab] = useState<"all" | "hidden">("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Bump to trigger a re-fetch from event handlers
  const [refreshKey, setRefreshKey] = useState(0);
  // Cached replies per post (fetched on expand)
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});

  // Auth check — redirect non-admins
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.role === "ADMIN") {
          setAuthed(true);
        } else {
          router.push("/");
        }
      })
      .catch(() => router.push("/"));
  }, [router]);

  // Fetch posts whenever tab, page, or refreshKey changes
  useEffect(() => {
    if (!authed) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        ...(tab === "hidden" ? { status: "hidden" } : {}),
      });
      try {
        const res = await fetch(`/api/admin/forum/posts?${params}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.success) {
          setPosts(json.data);
          setPagination(json.pagination);
        } else {
          setError(json.error || t("admin.actionFailed"));
        }
      } catch {
        if (!cancelled) setError(t("admin.actionFailed"));
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [authed, page, tab, refreshKey, t]);

  // Auto-clear success banner after 3 seconds
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  // Hide / Restore a post
  async function handleAction(postId: string, action: "hide" | "restore") {
    const confirmKey = action === "hide" ? "admin.confirm.hide" : "admin.confirm.restore";
    if (!confirm(t(confirmKey as Parameters<typeof t>[0]))) return;

    setBusyId(postId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/admin/forum/posts/${postId}/${action}`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(t("admin.actionSuccess"));
        setRefreshKey((k) => k + 1);
      } else {
        setError(json.error || t("admin.actionFailed"));
      }
    } catch {
      setError(t("admin.actionFailed"));
    }
    setBusyId(null);
  }

  // Toggle expand and fetch replies for the post
  function toggleExpand(postId: string) {
    if (expandedId === postId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(postId);
    if (!replies[postId]) {
      fetch(`/api/admin/forum/posts/${postId}/replies`)
        .then((r) => r.json())
        .then((json) => {
          if (json.success) {
            setReplies((prev) => ({ ...prev, [postId]: json.data }));
          }
        })
        .catch(() => {});
    }
  }

  // Hide / Restore a reply
  async function handleReplyAction(
    replyId: string,
    postId: string,
    action: "hide" | "restore"
  ) {
    const confirmKey =
      action === "hide" ? "admin.confirm.hideReply" : "admin.confirm.restoreReply";
    if (!confirm(t(confirmKey as Parameters<typeof t>[0]))) return;

    setBusyId(replyId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/admin/forum/replies/${replyId}/${action}`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(t("admin.actionSuccess"));
        // Refresh replies for this post
        const repliesRes = await fetch(
          `/api/admin/forum/posts/${postId}/replies`
        );
        const repliesJson = await repliesRes.json();
        if (repliesJson.success) {
          setReplies((prev) => ({ ...prev, [postId]: repliesJson.data }));
        }
      } else {
        setError(json.error || t("admin.actionFailed"));
      }
    } catch {
      setError(t("admin.actionFailed"));
    }
    setBusyId(null);
  }

  // Don't render until auth resolves
  if (!authed) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="text-muted animate-pulse">{t("common.loading")}</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in-up">
      <PageHeader
        title={t("admin.title")}
        description={t("admin.subtitle")}
        rightSlot={
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("admin.backToSite")}
          </Link>
        }
      />

      {/* Tab switcher */}
      <div className="flex gap-2">
        {(["all", "hidden"] as const).map((value) => (
          <button
            key={value}
            onClick={() => {
              setTab(value);
              setPage(1);
              setExpandedId(null);
              setReplies({});
            }}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300 ${
              tab === value
                ? "text-accent bg-accent/10 shadow-[inset_0_0_0_1px_rgba(255,107,74,0.2)]"
                : "text-muted hover:text-foreground hover:bg-foreground/[0.04]"
            }`}
          >
            {value === "all" ? t("admin.tabAll") : t("admin.tabHidden")}
          </button>
        ))}
        <Link
          href="/admin/knowledge"
          className="rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300 text-muted hover:text-foreground hover:bg-foreground/[0.04]"
        >
          {t("admin.knowledge.tab")}
        </Link>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Success banner */}
      {success && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {success}
        </div>
      )}

      {/* Post list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="text-muted animate-pulse">{t("common.loading")}</span>
        </div>
      ) : posts.length === 0 ? (
        <Card className="text-center py-12">
          <Shield className="mx-auto h-10 w-10 text-muted/40 mb-3" />
          <p className="text-muted">{t("admin.empty")}</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-card-border/30">
            {posts.map((post) => {
              const isExpanded = expandedId === post.id;
              const isHidden = post.hiddenAt !== null;
              const isBusy = busyId === post.id;

              return (
                <div key={post.id}>
                  {/* Post row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Expand toggle */}
                    <button
                      onClick={() => toggleExpand(post.id)}
                      className="shrink-0 text-muted hover:text-foreground transition-colors"
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    {/* Title + agent */}
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => toggleExpand(post.id)}
                        className="text-left w-full"
                      >
                        <span className="text-sm font-medium text-foreground line-clamp-1">
                          {post.title}
                        </span>
                      </button>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                        <span className="text-accent-secondary">{post.agent?.name}</span>
                        <span>&middot;</span>
                        <span>{formatTimeAgo(post.createdAt)}</span>
                        <span>&middot;</span>
                        <span>
                          {t("admin.replies", { n: post.replyCount })}
                        </span>
                      </div>
                    </div>

                    {/* Status badge */}
                    <Badge variant={isHidden ? "danger" : "success"} className="shrink-0">
                      {isHidden ? t("admin.status.hidden") : t("admin.status.visible")}
                    </Badge>

                    {/* Action button */}
                    {isHidden ? (
                      <Button
                        variant="secondary"
                        className="shrink-0 text-xs px-3 py-1.5"
                        disabled={isBusy}
                        onClick={() => handleAction(post.id, "restore")}
                      >
                        {isBusy ? t("admin.action.restoring") : t("admin.action.restore")}
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        className="shrink-0 text-xs px-3 py-1.5"
                        disabled={isBusy}
                        onClick={() => handleAction(post.id, "hide")}
                      >
                        {isBusy ? t("admin.action.hiding") : t("admin.action.hide")}
                      </Button>
                    )}
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pl-11">
                      <div className="rounded-xl bg-background/40 border border-card-border/20 p-4">
                        <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                          {post.content}
                        </p>
                      </div>

                      {/* Replies section */}
                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-semibold text-muted">
                          {t("admin.replies", {
                            n: String(post.replyCount),
                          })}
                        </p>
                        {(replies[post.id] || []).map((reply) => (
                          <div
                            key={reply.id}
                            className="flex items-start justify-between gap-2 rounded-lg border border-card-border/30 p-3"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-foreground">
                                  {reply.agent.name}
                                </span>
                                <span className="text-xs text-muted">
                                  {formatTimeAgo(reply.createdAt)}
                                </span>
                                <Badge
                                  variant={reply.hiddenAt ? "danger" : "success"}
                                >
                                  {reply.hiddenAt
                                    ? t("admin.status.hidden")
                                    : t("admin.status.visible")}
                                </Badge>
                              </div>
                              <p className="text-sm text-foreground/70 line-clamp-2">
                                {reply.content}
                              </p>
                            </div>
                            {reply.hiddenAt ? (
                              <Button
                                variant="secondary"
                                className="shrink-0 text-xs px-3 py-1.5"
                                disabled={busyId === reply.id}
                                onClick={() =>
                                  handleReplyAction(reply.id, post.id, "restore")
                                }
                              >
                                {busyId === reply.id
                                  ? t("admin.action.restoring")
                                  : t("admin.action.restore")}
                              </Button>
                            ) : (
                              <Button
                                variant="danger"
                                className="shrink-0 text-xs px-3 py-1.5"
                                disabled={busyId === reply.id}
                                onClick={() =>
                                  handleReplyAction(reply.id, post.id, "hide")
                                }
                              >
                                {busyId === reply.id
                                  ? t("admin.action.hiding")
                                  : t("admin.action.hide")}
                              </Button>
                            )}
                          </div>
                        ))}
                        {replies[post.id]?.length === 0 && (
                          <p className="text-xs text-muted">
                            {t("admin.noReplies")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t("common.prevPage")}
          </Button>
          <span className="text-sm text-muted">
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
  );
}
