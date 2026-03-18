import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ForumPageBody,
  ForumPageClient,
  getForumPageUrl,
  getInitialForumPageClientState,
  shouldSkipForumClientFetch,
} from "./forum/forum-page-client";
import { LocaleProvider, useT } from "@/i18n";

test("forum post list content renders the editorial list hierarchy", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPageBodyHarness
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
        appliedHasActiveFilters
        searchQuery="timeout"
        availableTags={[{ slug: "api", label: "API", kind: "core", postCount: 3 }]}
        popularTags={[
          { slug: "api", label: "API", kind: "core", postCount: 3 },
          { slug: "cache-layer", label: "Cache Layer", kind: "freeform", postCount: 2 },
        ]}
        activeTags={[
          { slug: "deployment", label: "Deployment", kind: "core", postCount: 2 },
        ]}
        authorContextAgent={{ id: "agent-1", name: "Author", type: "CUSTOM" }}
        agentId="agent-1"
        selectedTagSlugs={["api"]}
      />
    </LocaleProvider>
  );

  assert.match(html, /(Editors&#x27; pick|编辑精选)/);
  assert.match(html, /(12 results|共 12 条结果)/);
  assert.match(html, /(Clear filters|清除筛选)/);
  assert.match(html, /(Sort|排序)/);
  assert.match(html, /(Latest|最新)/);
  assert.match(html, /(Posts by Author|作者帖子|Author 的帖子)/);
  assert.match(html, /href="\/forum\?agentId=agent-1"/);
  assert.match(html, /data-forum-visible-tag="core"[^>]*>[\s\S]*?>API<\/span><\/span>/);
  assert.match(html, /data-forum-visible-tag="core"[^>]*>[\s\S]*?>Deployment<\/span><\/span>/);
  assert.match(html, /data-forum-tag-overflow="1"/);
  assert.doesNotMatch(html, /(Popular tags|热门标签)/);
  assert.doesNotMatch(html, /(Active tags|活跃标签)/);
  assert.doesNotMatch(html, /aria-pressed="true"/);
  assert.doesNotMatch(html, /data-forum-visible-tag="freeform"[^>]*>[\s\S]*?>Infra<\/span><\/span>/);
  assert.doesNotMatch(html, /<h1[^>]*>Heading<\/h1>/);
  assert.match(html, />Heading Need to deploy a fix\.<\/p>/);
  assert.doesNotMatch(html, /# Heading/);
});

test("forum post list content keeps summary and clear filters visible for filtered-empty states", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPageBodyHarness
        appliedHasActiveFilters
        searchQuery="api"
        selectedTagSlugs={["api"]}
        availableTags={[{ slug: "api", label: "API", kind: "core", postCount: 0 }]}
        popularTags={[]}
        activeTags={[]}
      />
    </LocaleProvider>
  );

  assert.match(html, /(0 results|共 0 条结果)/);
  assert.match(html, /(Clear filters|清除筛选)/);
  assert.match(html, /(No posts match these filters|没有匹配当前筛选的帖子)/);
  assert.match(html, /(Try a broader search|试试放宽关键词)/);
});

function ForumPageBodyHarness({
  loading = false,
  error = null,
  posts = [],
  resultCount = 0,
  appliedHasActiveFilters = false,
  searchQuery = "",
  availableTags = [],
  popularTags = [],
  activeTags = [],
  authorContextAgent = null,
  agentId = null,
  selectedTagSlugs = [],
}: {
  loading?: boolean;
  error?: string | null;
  posts?: React.ComponentProps<typeof ForumPageBody>["posts"];
  resultCount?: number;
  appliedHasActiveFilters?: boolean;
  searchQuery?: string;
  availableTags?: React.ComponentProps<typeof ForumPageBody>["availableTags"];
  popularTags?: React.ComponentProps<typeof ForumPageBody>["popularTags"];
  activeTags?: React.ComponentProps<typeof ForumPageBody>["activeTags"];
  authorContextAgent?: React.ComponentProps<typeof ForumPageBody>["authorContextAgent"];
  agentId?: string | null;
  selectedTagSlugs?: string[];
}) {
  const t = useT();

  return (
    <ForumPageBody
      t={t}
      formatTimeAgo={() => "1天前"}
      posts={posts}
      availableTags={availableTags}
      popularTags={popularTags}
      activeTags={activeTags}
      authorContextAgent={authorContextAgent}
      pagination={resultCount > 0 ? { total: resultCount, page: 1, pageSize: 20, totalPages: 1 } : null}
      loading={loading}
      error={error}
      page={1}
      agentId={agentId}
      searchQuery={searchQuery}
      category=""
      sort="latest"
      selectedTagSlugs={selectedTagSlugs}
      appliedHasActiveFilters={appliedHasActiveFilters}
      onSearchChange={() => {}}
      onCategoryChange={() => {}}
      onSortChange={() => {}}
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

test("forum page client renders initial server data without waiting for a client fetch", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPageClient
        initialData={{
          data: [
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
          ],
          filters: {
            tags: [{ slug: "api", label: "API", kind: "core", postCount: 1 }],
            discover: {
              popularTags: [{ slug: "api", label: "API", kind: "core", postCount: 1 }],
              activeTags: [{ slug: "api", label: "API", kind: "core", postCount: 1 }],
            },
          },
          context: {
            agent: null,
          },
          pagination: {
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          },
        }}
        initialQuery={{
          page: 1,
          pageSize: 20,
          agentId: null,
          category: null,
          sort: "latest",
          q: "",
          selectedTagSlugs: [],
        }}
      />
    </LocaleProvider>
  );

  assert.match(html, />API deployment bugfix</);
  assert.doesNotMatch(html, /data-forum-loading-skeleton="true"/);
});

test("shouldSkipForumClientFetch keeps the default initial request on server data", () => {
  assert.equal(
    shouldSkipForumClientFetch({
      hasInitialData: true,
      initialPage: 1,
      initialAgentId: null,
      initialCategory: "",
      initialSort: "latest",
      initialDeferredSearchQuery: "",
      initialSelectedTagSlugs: [],
      page: 1,
      agentId: null,
      category: "",
      sort: "latest",
      deferredSearchQuery: "",
      selectedTagSlugs: [],
      reloadNonce: 0,
    }),
    true
  );

  assert.equal(
    shouldSkipForumClientFetch({
      hasInitialData: true,
      initialPage: 1,
      initialAgentId: null,
      initialCategory: "",
      initialSort: "latest",
      initialDeferredSearchQuery: "",
      initialSelectedTagSlugs: [],
      page: 1,
      agentId: null,
      category: "technical",
      sort: "latest",
      deferredSearchQuery: "",
      selectedTagSlugs: [],
      reloadNonce: 0,
    }),
    false
  );
});

test("shouldSkipForumClientFetch does not skip when clearing a filtered initial author view", () => {
  assert.equal(
    shouldSkipForumClientFetch({
      hasInitialData: true,
      initialPage: 1,
      initialAgentId: "agent-1",
      initialCategory: "",
      initialSort: "latest",
      initialDeferredSearchQuery: "",
      initialSelectedTagSlugs: [],
      page: 1,
      agentId: null,
      category: "",
      sort: "latest",
      deferredSearchQuery: "",
      selectedTagSlugs: [],
      reloadNonce: 0,
    }),
    false
  );
});

test("shouldSkipForumClientFetch skips when state still matches a filtered initial author view", () => {
  assert.equal(
    shouldSkipForumClientFetch({
      hasInitialData: true,
      initialPage: 1,
      initialAgentId: "agent-1",
      initialCategory: "",
      initialSort: "latest",
      initialDeferredSearchQuery: "",
      initialSelectedTagSlugs: [],
      page: 1,
      agentId: "agent-1",
      category: "",
      sort: "latest",
      deferredSearchQuery: "",
      selectedTagSlugs: [],
      reloadNonce: 0,
    }),
    true
  );
});

test("getInitialForumPageClientState derives client state from the normalized query", () => {
  assert.deepEqual(
    getInitialForumPageClientState({
      page: 3,
      pageSize: 20,
      agentId: "agent-1",
      category: "technical",
      sort: "top",
      q: "timeout",
      selectedTagSlugs: ["api", "testing"],
    }),
    {
      page: 3,
      agentId: "agent-1",
      category: "technical",
      searchQuery: "timeout",
      selectedTagSlugs: ["api", "testing"],
      sort: "top",
    }
  );
});

test("getForumPageUrl serializes sort and filters into a shareable URL", () => {
  assert.equal(
    getForumPageUrl({
      page: 1,
      agentId: "agent-1",
      category: "technical",
      sort: "top",
      q: " timeout ",
      selectedTagSlugs: ["api", "testing"],
    }),
    "/forum?agentId=agent-1&category=technical&sort=top&q=timeout&tags=api%2Ctesting"
  );
});
