import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ForumPageBody, ForumPostListContent } from "./forum/page";
import { LocaleProvider, useT } from "@/i18n";

function ForumPostListContentHarness() {
  const t = useT();

  return (
    <ForumPostListContent
      t={t}
      formatTimeAgo={() => "1天前"}
      posts={[
        {
          id: "post-1",
          title: "API deployment bugfix",
          content: "# Heading\n\nNeed to deploy a fix.",
          category: "technical",
          featured: true,
          viewCount: 5,
          likeCount: 1,
          createdAt: "2026-03-18T00:00:00.000Z",
          updatedAt: "2026-03-18T06:00:00.000Z",
          replyCount: 2,
          agent: { id: "agent-1", name: "Author", type: "CUSTOM" },
          tags: [
            { slug: "infra", label: "Infra", kind: "freeform", source: "manual" },
            { slug: "api", label: "API", kind: "core", source: "auto" },
            {
              slug: "deployment",
              label: "Deployment",
              kind: "core",
              source: "auto",
            },
          ],
        },
      ]}
      resultCount={12}
      hasActiveFilters
      selectedTagSlugs={["api"]}
      availableTags={[
        { slug: "api", label: "API", kind: "core", postCount: 3 },
      ]}
      onTagToggle={() => {}}
      onClearFilters={() => {}}
    />
  );
}

function ForumPostListContentEmptyHarness() {
  const t = useT();

  return (
    <ForumPostListContent
      t={t}
      formatTimeAgo={() => "1天前"}
      posts={[]}
      resultCount={0}
      hasActiveFilters
      selectedTagSlugs={["api"]}
      availableTags={[
        { slug: "api", label: "API", kind: "core", postCount: 0 },
      ]}
      onTagToggle={() => {}}
      onClearFilters={() => {}}
      emptyStateTitle="No posts match these filters"
      emptyStateDescription="Try a broader search."
    />
  );
}

test("forum post list content renders the editorial list hierarchy", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPostListContentHarness />
    </LocaleProvider>
  );

  assert.match(html, /(Editors&#x27; pick|编辑精选)/);
  assert.match(html, /(12 results|共 12 条结果)/);
  assert.match(html, /(Clear filters|清除筛选)/);
  assert.match(html, /data-forum-visible-tag="core"[^>]*>[\s\S]*?>API<\/span><\/span>/);
  assert.match(html, /data-forum-visible-tag="core"[^>]*>[\s\S]*?>Deployment<\/span><\/span>/);
  assert.match(html, /data-forum-tag-overflow="1"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /\(3\)/);
  assert.doesNotMatch(html, /data-forum-visible-tag="freeform"[^>]*>[\s\S]*?>Infra<\/span><\/span>/);
  assert.doesNotMatch(html, /<h1[^>]*>Heading<\/h1>/);
  assert.match(html, />Heading Need to deploy a fix\.<\/p>/);
  assert.doesNotMatch(html, /# Heading/);
});

test("forum post list content keeps summary and clear filters visible for filtered-empty states", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPostListContentEmptyHarness />
    </LocaleProvider>
  );

  assert.match(html, /(0 results|共 0 条结果)/);
  assert.match(html, /(Clear filters|清除筛选)/);
  assert.match(html, /No posts match these filters/);
  assert.match(html, /Try a broader search\./);
});

function ForumPageBodyHarness({
  loading = false,
  error = null,
  posts = [],
  resultCount = 0,
  appliedHasActiveFilters = false,
  searchQuery = "",
}: {
  loading?: boolean;
  error?: string | null;
  posts?: React.ComponentProps<typeof ForumPostListContent>["posts"];
  resultCount?: number;
  appliedHasActiveFilters?: boolean;
  searchQuery?: string;
}) {
  const t = useT();

  return (
    <ForumPageBody
      t={t}
      formatTimeAgo={() => "1天前"}
      posts={posts}
      availableTags={[]}
      pagination={resultCount > 0 ? { total: resultCount, page: 1, pageSize: 20, totalPages: 1 } : null}
      loading={loading}
      error={error}
      page={1}
      searchQuery={searchQuery}
      category=""
      selectedTagSlugs={[]}
      appliedHasActiveFilters={appliedHasActiveFilters}
      onSearchChange={() => {}}
      onCategoryChange={() => {}}
      onTagToggle={() => {}}
      onClearFilters={() => {}}
      onRetryLoad={() => {}}
      onPreviousPage={() => {}}
      onNextPage={() => {}}
    />
  );
}

test("forum page body renders loading skeleton cards", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPageBodyHarness loading />
    </LocaleProvider>
  );

  assert.match(html, /data-forum-loading-skeleton="true"/);
  assert.equal((html.match(/data-forum-loading-card="true"/g) ?? []).length, 3);
});

test("forum page body keeps the current list visible while a filtered refresh is loading", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPageBodyHarness
        loading
        appliedHasActiveFilters
        posts={[
          {
            id: "post-1",
            title: "API deployment bugfix",
            content: "# Heading\n\nNeed to deploy a fix.",
            category: "technical",
            featured: true,
            viewCount: 5,
            likeCount: 1,
            createdAt: "2026-03-18T00:00:00.000Z",
            updatedAt: "2026-03-18T06:00:00.000Z",
            replyCount: 2,
            agent: { id: "agent-1", name: "Author", type: "CUSTOM" },
            tags: [{ slug: "api", label: "API", kind: "core", source: "auto" }],
          },
        ]}
        resultCount={1}
      />
    </LocaleProvider>
  );

  assert.match(html, />API deployment bugfix</);
  assert.match(html, /data-forum-refreshing="true"/);
  assert.doesNotMatch(html, /data-forum-loading-skeleton="true"/);
});

test("forum page body renders retry UI for error state", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPageBodyHarness error="boom" />
    </LocaleProvider>
  );

  assert.match(html, />boom<\/p>/);
  assert.match(html, /(Retry load|重新加载)/);
});

test("forum page body distinguishes filtered and unfiltered empty states using applied filters", () => {
  const filteredHtml = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPageBodyHarness appliedHasActiveFilters searchQuery="draft query" />
    </LocaleProvider>
  );
  const unfilteredHtml = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPageBodyHarness appliedHasActiveFilters={false} searchQuery="draft query" />
    </LocaleProvider>
  );

  assert.match(filteredHtml, /(No posts match these filters|没有匹配当前筛选的帖子)/);
  assert.match(filteredHtml, /(0 results|共 0 条结果)/);
  assert.match(filteredHtml, /(Clear filters|清除筛选)/);
  assert.match(unfilteredHtml, /(No posts yet\. Be the first to start a discussion!|暂无帖子，来发第一帖吧！)/);
  assert.doesNotMatch(unfilteredHtml, /(No posts match these filters|没有匹配当前筛选的帖子)/);
});
