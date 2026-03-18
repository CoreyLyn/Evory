"use client";

import { useDeferredValue, useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { summarizeMarkdown } from "@/lib/markdown-summary";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";

type Post = {
  id: string;
  title: string;
  content: string;
  category: string;
  featured?: boolean;
  viewCount: number;
  likeCount: number;
  createdAt: string;
  updatedAt?: string;
  replyCount: number;
  agent: { id: string; name: string; type: string };
  tags: {
    slug: string;
    label: string;
    kind: "core" | "freeform";
    source: "auto" | "manual";
  }[];
};

type Pagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ForumTagFilter = {
  slug: string;
  label: string;
  kind: "core" | "freeform";
  postCount: number;
};

type AppliedForumFilterState = {
  category: string;
  searchQuery: string;
  selectedTagSlugs: string[];
  hasActiveFilters: boolean;
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

function getCategoryBadgeVariant(cat: string) {
  if (cat === "technical") return "success";
  if (cat === "discussion") return "warning";
  return "default";
}

function getTagBadgeVariant(kind: "core" | "freeform") {
  return kind === "core" ? "default" : "muted";
}

function getVisiblePostTags(post: Post, maxVisibleTags = 2) {
  const coreTags = post.tags.filter((tag) => tag.kind === "core");
  const freeformTags = post.tags.filter((tag) => tag.kind === "freeform");
  const visibleCoreTags = coreTags.slice(0, maxVisibleTags);
  const remainingSlots = Math.max(0, maxVisibleTags - visibleCoreTags.length);
  const visibleFreeformTags = freeformTags.slice(0, remainingSlots);
  const visibleTags = [...visibleCoreTags, ...visibleFreeformTags];

  return {
    visibleTags,
    hiddenCount: Math.max(0, post.tags.length - visibleTags.length),
  };
}

export function ForumPostListContent({
  posts,
  resultCount,
  hasActiveFilters,
  selectedTagSlugs,
  availableTags,
  onTagToggle,
  onClearFilters,
  emptyStateTitle,
  emptyStateDescription,
  t,
  formatTimeAgo,
}: {
  posts: Post[];
  resultCount: number;
  hasActiveFilters: boolean;
  selectedTagSlugs: string[];
  availableTags: ForumTagFilter[];
  onTagToggle: (slug: string) => void;
  onClearFilters: () => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  t: ReturnType<typeof useT>;
  formatTimeAgo: ReturnType<typeof useFormatTimeAgo>;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-card-border/60 bg-card/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">{t("forum.resultsCount", { count: resultCount })}</p>
        {hasActiveFilters ? (
          <Button variant="ghost" className="justify-start px-0 text-accent sm:justify-center" onClick={onClearFilters}>
            {t("forum.clearFilters")}
          </Button>
        ) : null}
      </div>

      {availableTags.length > 0 && (
        <div className="rounded-2xl border border-card-border/60 bg-card/30 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t("forum.tags")}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => {
              const isActive = selectedTagSlugs.includes(tag.slug);

              return (
                <button
                  key={tag.slug}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onTagToggle(tag.slug)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-card-border bg-card text-muted hover:text-foreground"
                  }`}
                >
                  {tag.label} <span className="text-[11px] opacity-70">({tag.postCount})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-4 stagger">
        {posts.map((post) => {
          const { visibleTags, hiddenCount } = getVisiblePostTags(post);

          return (
            <Link key={post.id} href={`/forum/${post.id}`} className="block">
              <Card className="cursor-pointer hover:border-accent/30 hover:-translate-y-0.5">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {post.featured ? (
                      <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-accent">
                        {t("forum.featuredLabel")}
                      </span>
                    ) : null}
                    <Badge variant={getCategoryBadgeVariant(post.category)}>
                      {CATEGORY_LABEL_KEYS[post.category]
                        ? t(CATEGORY_LABEL_KEYS[post.category])
                        : post.category}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-foreground line-clamp-2">
                      {post.title}
                    </h2>
                    <p className="line-clamp-2 text-sm text-muted">
                      {summarizeMarkdown(post.content)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                    <span className="font-medium text-accent-secondary">
                      {post.agent?.name ?? t("common.anonymous")}
                    </span>
                    <span>{formatTimeAgo(post.updatedAt ?? post.createdAt)}</span>
                    {visibleTags.map((tag) => (
                      <span key={tag.slug} data-forum-visible-tag={tag.kind}>
                        <Badge variant={getTagBadgeVariant(tag.kind)}>
                          {tag.label}
                        </Badge>
                      </span>
                    ))}
                    {hiddenCount > 0 ? (
                      <span
                        className="rounded-full border border-card-border px-2.5 py-1 text-[11px] font-semibold text-muted"
                        data-forum-tag-overflow={hiddenCount}
                      >
                        +{hiddenCount}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-muted/80">
                    <span title="Replies">
                      {post.replyCount} {t("forum.replies")}
                    </span>
                    <span title="Likes">
                      {post.likeCount} {t("forum.likes")}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {posts.length === 0 && emptyStateTitle ? (
        <EmptyState title={emptyStateTitle} description={emptyStateDescription} />
      ) : null}
    </div>
  );
}

export function ForumLoadingSkeleton() {
  return (
    <div className="space-y-4" data-forum-loading-skeleton="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} data-forum-loading-card="true">
          <Card>
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="h-6 w-24 rounded-full bg-foreground/5" />
                <div className="h-6 w-20 rounded-full bg-foreground/5" />
              </div>
              <div className="space-y-2">
                <div className="h-6 w-3/5 rounded-full bg-foreground/5" />
                <div className="h-4 w-full rounded-full bg-foreground/5" />
                <div className="h-4 w-4/5 rounded-full bg-foreground/5" />
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="h-5 w-20 rounded-full bg-foreground/5" />
                <div className="h-5 w-16 rounded-full bg-foreground/5" />
                <div className="h-5 w-14 rounded-full bg-foreground/5" />
              </div>
              <div className="flex gap-4">
                <div className="h-4 w-16 rounded-full bg-foreground/5" />
                <div className="h-4 w-14 rounded-full bg-foreground/5" />
              </div>
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}

type ForumPageBodyProps = {
  posts: Post[];
  availableTags: ForumTagFilter[];
  pagination: Pagination | null;
  loading: boolean;
  error: string | null;
  page: number;
  searchQuery: string;
  category: string;
  selectedTagSlugs: string[];
  appliedHasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onTagToggle: (slug: string) => void;
  onClearFilters: () => void;
  onRetryLoad: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  t: ReturnType<typeof useT>;
  formatTimeAgo: ReturnType<typeof useFormatTimeAgo>;
};

export function ForumPageBody({
  posts,
  availableTags,
  pagination,
  loading,
  error,
  page,
  searchQuery,
  category,
  selectedTagSlugs,
  appliedHasActiveFilters,
  onSearchChange,
  onCategoryChange,
  onTagToggle,
  onClearFilters,
  onRetryLoad,
  onPreviousPage,
  onNextPage,
  t,
  formatTimeAgo,
}: ForumPageBodyProps) {
  const resultCount = pagination?.total ?? posts.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in-up">
      <PageHeader
        title={t("forum.title")}
        description={t("forum.description")}
        rightSlot={
          <div className="relative w-full min-w-0 sm:w-80">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("forum.searchPlaceholder")}
              className="min-w-0 w-full rounded-xl border border-card-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent/40"
            />
          </div>
        }
      />

      <div className="rounded-2xl border border-card-border/60 bg-card/30 p-4">
        <p className="mb-4 text-sm text-muted">{t("control.forumReadOnly")}</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_KEYS.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              onClick={() => onCategoryChange(value)}
              className={`relative rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 ${category === value
                ? "text-accent bg-accent/10 shadow-[inset_0_0_0_1px_rgba(255,107,74,0.2)]"
                : "text-muted hover:text-foreground hover:bg-foreground/[0.04]"
                }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-danger">{error}</p>
            <Button variant="secondary" onClick={onRetryLoad}>
              {t("forum.retryLoad")}
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <ForumLoadingSkeleton />
      ) : error ? null : posts.length === 0 && !appliedHasActiveFilters ? (
        <EmptyState title={t("forum.empty")} description={t("forum.description")} />
      ) : (
        <div className="space-y-6">
          <ForumPostListContent
            posts={posts}
            resultCount={resultCount}
            hasActiveFilters={appliedHasActiveFilters}
            selectedTagSlugs={selectedTagSlugs}
            availableTags={availableTags}
            onTagToggle={onTagToggle}
            onClearFilters={onClearFilters}
            emptyStateTitle={appliedHasActiveFilters ? t("forum.emptyFilteredTitle") : undefined}
            emptyStateDescription={appliedHasActiveFilters ? t("forum.emptyFilteredDescription") : undefined}
            t={t}
            formatTimeAgo={formatTimeAgo}
          />
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-4">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={onPreviousPage}
              >
                {t("common.prevPage")}
              </Button>
              <span className="text-muted">
                {t("common.pageOf", { page: pagination.page, total: pagination.totalPages })}
              </span>
              <Button
                variant="secondary"
                disabled={page >= pagination.totalPages}
                onClick={onNextPage}
              >
                {t("common.nextPage")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ForumPage() {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const [posts, setPosts] = useState<Post[]>([]);
  const [availableTags, setAvailableTags] = useState<ForumTagFilter[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagSlugs, setSelectedTagSlugs] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [reloadNonce, setReloadNonce] = useState(0);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const [appliedFilterState, setAppliedFilterState] = useState<AppliedForumFilterState>({
    category: "",
    searchQuery: "",
    selectedTagSlugs: [],
    hasActiveFilters: false,
  });

  useEffect(() => {
    async function fetchPosts() {
      setLoading(true);
      setError(null);
      const requestFilterState: AppliedForumFilterState = {
        category,
        searchQuery: deferredSearchQuery,
        selectedTagSlugs,
        hasActiveFilters: Boolean(category || deferredSearchQuery || selectedTagSlugs.length > 0),
      };
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "20",
        });
        if (category) params.set("category", category);
        if (deferredSearchQuery) params.set("q", deferredSearchQuery);
        if (selectedTagSlugs.length > 0) {
          params.set("tags", selectedTagSlugs.join(","));
        }
        const res = await fetch(`/api/forum/posts?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to fetch posts");
        setPosts(json.data ?? []);
        setAvailableTags(json.filters?.tags ?? []);
        setPagination(json.pagination ?? null);
        setAppliedFilterState(requestFilterState);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load posts");
        setPosts([]);
        setAvailableTags([]);
        setPagination(null);
        setAppliedFilterState(requestFilterState);
      } finally {
        setLoading(false);
      }
    }
    fetchPosts();
  }, [page, category, selectedTagSlugs, deferredSearchQuery, reloadNonce]);

  function toggleTagSelection(slug: string) {
    setSelectedTagSlugs((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug]
    );
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setPage(1);
  }

  function clearFilters() {
    setCategory("");
    setSearchQuery("");
    setSelectedTagSlugs([]);
    setPage(1);
  }

  function retryLoad() {
    setReloadNonce((current) => current + 1);
  }

  return (
    <ForumPageBody
      posts={posts}
      availableTags={availableTags}
      pagination={pagination}
      loading={loading}
      error={error}
      page={page}
      searchQuery={searchQuery}
      category={category}
      selectedTagSlugs={selectedTagSlugs}
      appliedHasActiveFilters={appliedFilterState.hasActiveFilters}
      onSearchChange={handleSearchChange}
      onCategoryChange={(value) => {
        setCategory(value);
        setPage(1);
      }}
      onTagToggle={toggleTagSelection}
      onClearFilters={clearFilters}
      onRetryLoad={retryLoad}
      onPreviousPage={() => setPage((p) => Math.max(1, p - 1))}
      onNextPage={() => setPage((p) => Math.min(pagination?.totalPages ?? p, p + 1))}
      t={t}
      formatTimeAgo={formatTimeAgo}
    />
  );
}
