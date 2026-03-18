"use client";

import { useDeferredValue, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { summarizeMarkdown } from "@/lib/markdown-summary";
import {
  type ForumListPagination,
  type ForumListPost,
  type ForumListTagFilter,
  type ForumPostListData,
} from "@/lib/forum-post-list-data";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import {
  type ForumListQuery,
  type ForumSort,
  serializeForumListQuery,
} from "@/lib/forum-list-query";

type AppliedForumFilterState = {
  hasActiveFilters: boolean;
};

type ForumPageClientState = {
  page: number;
  category: string;
  searchQuery: string;
  selectedTagSlugs: string[];
  sort: ForumSort;
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

function getVisiblePostTags(post: ForumListPost, maxVisibleTags = 2) {
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
  posts: ForumListPost[];
  resultCount: number;
  hasActiveFilters: boolean;
  selectedTagSlugs: string[];
  availableTags: ForumListTagFilter[];
  onTagToggle: (slug: string) => void;
  onClearFilters: () => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  t: ReturnType<typeof useT>;
  formatTimeAgo: ReturnType<typeof useFormatTimeAgo>;
}) {
  return (
    <div className="space-y-5">
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
  posts: ForumListPost[];
  availableTags: ForumListTagFilter[];
  pagination: ForumListPagination | null;
  loading: boolean;
  error: string | null;
  page: number;
  searchQuery: string;
  category: string;
  sort: ForumSort;
  selectedTagSlugs: string[];
  appliedHasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSortChange: (value: ForumSort) => void;
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
  sort,
  selectedTagSlugs,
  appliedHasActiveFilters,
  onSearchChange,
  onCategoryChange,
  onSortChange,
  onTagToggle,
  onClearFilters,
  onRetryLoad,
  onPreviousPage,
  onNextPage,
  t,
  formatTimeAgo,
}: ForumPageBodyProps) {
  const resultCount = pagination?.total ?? posts.length;
  const showInitialLoading = loading && posts.length === 0 && !error;
  const showRefreshing = loading && posts.length > 0 && !error;

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in-up">
      <PageHeader
        title={t("forum.title")}
        description={t("control.forumReadOnly")}
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

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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
          <label className="flex items-center gap-2 text-sm text-muted">
            <span className="sr-only">{t("forum.sortLabel")}</span>
            <select
              aria-label={t("forum.sortLabel")}
              value={sort}
              onChange={(event) => onSortChange(event.target.value as ForumSort)}
              className="rounded-lg border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            >
              <option value="latest">{t("forum.sortLatest")}</option>
              <option value="active">{t("forum.sortActive")}</option>
              <option value="top">{t("forum.sortTop")}</option>
            </select>
          </label>
        </div>

        {!error && !showInitialLoading ? (
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <span className="text-sm font-medium text-muted">{t("forum.resultsCount", { count: resultCount })}</span>
            {appliedHasActiveFilters ? (
              <Button variant="ghost" className="h-auto px-4 py-2 text-sm text-accent hover:bg-accent/10 hover:text-accent" onClick={onClearFilters}>
                {t("forum.clearFilters")}
              </Button>
            ) : null}
          </div>
        ) : null}
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

      {showInitialLoading ? (
        <ForumLoadingSkeleton />
      ) : error ? null : posts.length === 0 && !appliedHasActiveFilters ? (
        <EmptyState title={t("forum.empty")} description={t("forum.description")} />
      ) : (
        <div className="space-y-6">
          {showRefreshing ? (
            <div
              className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted"
              data-forum-refreshing="true"
            >
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent/70" />
              <span>{t("common.loading")}</span>
            </div>
          ) : null}
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

export function ForumPageClient({
  initialData,
  initialQuery,
}: {
  initialData?: ForumPostListData | null;
  initialQuery?: ForumListQuery;
}) {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const initialState = getInitialForumPageClientState(initialQuery);
  const [posts, setPosts] = useState<ForumListPost[]>(initialData?.data ?? []);
  const [availableTags, setAvailableTags] = useState<ForumListTagFilter[]>(
    initialData?.filters.tags ?? []
  );
  const [pagination, setPagination] = useState<ForumListPagination | null>(
    initialData?.pagination ?? null
  );
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(initialState.category);
  const [searchQuery, setSearchQuery] = useState(initialState.searchQuery);
  const [selectedTagSlugs, setSelectedTagSlugs] = useState<string[]>(
    initialState.selectedTagSlugs
  );
  const [page, setPage] = useState(initialState.page);
  const [sort, setSort] = useState<ForumSort>(initialState.sort);
  const [reloadNonce, setReloadNonce] = useState(0);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const [appliedFilterState, setAppliedFilterState] = useState<AppliedForumFilterState>({
    hasActiveFilters: Boolean(
      initialState.category ||
        initialState.searchQuery ||
        initialState.selectedTagSlugs.length > 0 ||
        initialState.sort !== "latest"
    ),
  });

  const shouldSkipInitialFetch = shouldSkipForumClientFetch({
    hasInitialData: Boolean(initialData),
    page,
    category,
    sort,
    deferredSearchQuery,
    selectedTagSlugs,
    reloadNonce,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = getForumPageUrl({
      page,
      category,
      sort,
      q: searchQuery,
      selectedTagSlugs,
    });

    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [page, category, sort, searchQuery, selectedTagSlugs]);

  useEffect(() => {
    if (shouldSkipInitialFetch) {
      return;
    }

    const controller = new AbortController();

    async function fetchPosts() {
      setLoading(true);
      setError(null);
      const requestFilterState: AppliedForumFilterState = {
        hasActiveFilters: Boolean(
          category ||
            deferredSearchQuery ||
            selectedTagSlugs.length > 0 ||
            sort !== "latest"
        ),
      };
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "20",
        });
        if (category) params.set("category", category);
        if (sort !== "latest") params.set("sort", sort);
        if (deferredSearchQuery) params.set("q", deferredSearchQuery);
        if (selectedTagSlugs.length > 0) {
          params.set("tags", selectedTagSlugs.join(","));
        }
        const res = await fetch(`/api/forum/posts?${params}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to fetch posts");
        setPosts(json.data ?? []);
        setAvailableTags(json.filters?.tags ?? []);
        setPagination(json.pagination ?? null);
        setAppliedFilterState(requestFilterState);
      } catch (e) {
        if (controller.signal.aborted) {
          return;
        }
        setError(e instanceof Error ? e.message : "Failed to load posts");
        setPosts([]);
        setAvailableTags([]);
        setPagination(null);
        setAppliedFilterState(requestFilterState);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    void fetchPosts();

    return () => {
      controller.abort();
    };
  }, [page, category, sort, selectedTagSlugs, deferredSearchQuery, reloadNonce, shouldSkipInitialFetch]);

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
    setSort("latest");
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
      sort={sort}
      selectedTagSlugs={selectedTagSlugs}
      appliedHasActiveFilters={appliedFilterState.hasActiveFilters}
      onSearchChange={handleSearchChange}
      onCategoryChange={(value) => {
        setCategory(value);
        setPage(1);
      }}
      onSortChange={(value) => {
        setSort(value);
        setPage(1);
      }}
      onTagToggle={toggleTagSelection}
      onClearFilters={clearFilters}
      onRetryLoad={retryLoad}
      onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
      onNextPage={() => setPage((current) => Math.min(pagination?.totalPages ?? current, current + 1))}
      t={t}
      formatTimeAgo={formatTimeAgo}
    />
  );
}

export function shouldSkipForumClientFetch({
  hasInitialData,
  page,
  category,
  sort,
  deferredSearchQuery,
  selectedTagSlugs,
  reloadNonce,
}: {
  hasInitialData: boolean;
  page: number;
  category: string;
  sort: ForumSort;
  deferredSearchQuery: string;
  selectedTagSlugs: string[];
  reloadNonce: number;
}) {
  return Boolean(
    hasInitialData &&
      page === 1 &&
      category === "" &&
      sort === "latest" &&
      deferredSearchQuery === "" &&
      selectedTagSlugs.length === 0 &&
      reloadNonce === 0
  );
}

export function getInitialForumPageClientState(
  initialQuery?: ForumListQuery
): ForumPageClientState {
  return {
    page: initialQuery?.page ?? 1,
    category: initialQuery?.category ?? "",
    searchQuery: initialQuery?.q ?? "",
    selectedTagSlugs: initialQuery?.selectedTagSlugs ?? [],
    sort: initialQuery?.sort ?? "latest",
  };
}

export function getForumPageUrl(input: {
  page: number;
  category: string;
  sort: ForumSort;
  q: string;
  selectedTagSlugs: string[];
}) {
  const queryString = serializeForumListQuery({
    page: input.page,
    pageSize: 20,
    category: input.category === "" ? null : (input.category as ForumListQuery["category"]),
    sort: input.sort,
    q: input.q.trim(),
    selectedTagSlugs: input.selectedTagSlugs,
  }).toString();

  return queryString ? `/forum?${queryString}` : "/forum";
}
