# Forum UI Information Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the read-only forum so the homepage feels like a knowledge-focused content stream, featured posts are lightweight and in-list, post cards are summary-first, and detail pages read as article-first with a distinct discussion section.

**Architecture:** Add a minimal tri-state featured override on `ForumPost` so admins can pin, suppress, or reset featured treatment without building a full admin UI. Pair that with one shared `src/lib/forum-feed.ts` helper for eligibility gating and in-list featured scoring, then thread the resulting metadata through the forum read APIs and into the existing list/detail UI with focused rendering tests and updated i18n copy.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7, TypeScript 5, Node.js native test runner, TSX

---

## File Map

- Modify: `src/test/factories.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260318_add_forum_post_featured_override/migration.sql`
- Create: `src/lib/forum-feed.ts`
- Create: `src/lib/forum-feed.test.ts`
- Create: `src/app/api/admin/forum/posts/[id]/featured/route.ts`
- Modify: `src/app/api/admin/forum/posts/route.ts`
- Modify: `src/app/api/admin/forum/posts/admin-posts.test.ts`
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/forum/posts/[id]/route.ts`
- Modify: `src/app/api/forum/posts/forum-hidden-filter.test.ts`
- Modify: `src/app/forum/page.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`
- Modify: `src/app/forum/[id]/page.tsx`
- Modify: `src/app/forum-post-detail-content.test.tsx`
- Create: `src/app/forum-post-page-state.test.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

## Task 1: Add featured-override persistence and shared forum-feed helpers

**Files:**
- Modify: `src/test/factories.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260318_add_forum_post_featured_override/migration.sql`
- Create: `src/lib/forum-feed.ts`
- Create: `src/lib/forum-feed.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `src/lib/forum-feed.test.ts` with focused tests for featured-candidate scoring and selection:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import {
  pickFeaturedForumPostIds,
  scoreForumFeaturedCandidate,
} from "./forum-feed";
import { createForumPostFixture } from "@/test/factories";

test("scoreForumFeaturedCandidate favors recent technical posts with core tags", () => {
  const strong = createForumPostFixture({
    id: "post-strong",
    category: "technical",
    content: "A".repeat(900),
    likeCount: 8,
    viewCount: 40,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T03:00:00.000Z",
    tags: [{ tag: { slug: "api", label: "API", kind: "CORE" }, source: "AUTO" }],
    _count: { replies: 4 },
  });
  const weak = createForumPostFixture({
    id: "post-weak",
    category: "general",
    content: "Short note",
    likeCount: 0,
    viewCount: 2,
    createdAt: "2026-02-20T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
    tags: [],
    _count: { replies: 0 },
  });

  assert.ok(
    scoreForumFeaturedCandidate(strong, new Date("2026-03-18T12:00:00.000Z")) >
      scoreForumFeaturedCandidate(weak, new Date("2026-03-18T12:00:00.000Z"))
  );
});

test("pickFeaturedForumPostIds returns at most two in-list featured ids", () => {
  const posts = [
    createForumPostFixture({ id: "post-1", category: "technical", content: "A".repeat(800), tags: [{ tag: { slug: "api", label: "API", kind: "CORE" }, source: "AUTO" }], _count: { replies: 3 } }),
    createForumPostFixture({ id: "post-2", category: "discussion", content: "B".repeat(700), tags: [{ tag: { slug: "deployment", label: "Deployment", kind: "CORE" }, source: "AUTO" }], _count: { replies: 2 } }),
    createForumPostFixture({ id: "post-3", category: "general", content: "Short", tags: [], _count: { replies: 0 } }),
  ];

  assert.deepEqual(
    pickFeaturedForumPostIds(posts, {
      now: new Date("2026-03-18T12:00:00.000Z"),
      limit: 2,
    }),
    ["post-1", "post-2"]
  );
});

test("pickFeaturedForumPostIds ignores short-body posts unless manually pinned", () => {
  const shortPost = createForumPostFixture({
    id: "post-short",
    category: "technical",
    content: "too short",
    updatedAt: "2026-03-18T03:00:00.000Z",
    tags: [{ tag: { slug: "api", label: "API", kind: "CORE" }, source: "AUTO" }],
    _count: { replies: 5 },
  });
  const pinnedPost = createForumPostFixture({
    id: "post-pinned",
    category: "general",
    content: "short pinned note",
    featuredOverride: true,
    updatedAt: "2026-03-18T03:00:00.000Z",
    tags: [],
    _count: { replies: 0 },
  });

  assert.deepEqual(
    pickFeaturedForumPostIds([shortPost, pinnedPost], {
      now: new Date("2026-03-18T12:00:00.000Z"),
      limit: 2,
    }),
    ["post-pinned"]
  );
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run: `node --import tsx --test src/lib/forum-feed.test.ts`
Expected: FAIL with module-not-found for `src/lib/forum-feed.ts`

- [ ] **Step 3: Add the Prisma field and migration**

Update `prisma/schema.prisma` so `ForumPost` includes:

```prisma
featuredOverride Boolean?
```

Create `prisma/migrations/20260318_add_forum_post_featured_override/migration.sql` with:

```sql
ALTER TABLE "ForumPost"
ADD COLUMN "featuredOverride" BOOLEAN;

CREATE INDEX "ForumPost_featuredOverride_idx" ON "ForumPost"("featuredOverride");
```

- [ ] **Step 4: Add the helper implementation**

Create `src/lib/forum-feed.ts` with a small, focused API:

```typescript
type ForumFeaturedCandidate = {
  id: string;
  category: string;
  content: string;
  likeCount: number;
  viewCount: number;
  featuredOverride?: boolean | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
  tags?: Array<{ source?: string; tag?: { kind?: string } } | { kind?: string }>;
  _count?: { replies?: number };
  replyCount?: number;
};

const FEATURED_WINDOW_DAYS = 14;
const MIN_FEATURED_CONTENT_LENGTH = 280;

export function scoreForumFeaturedCandidate(
  post: ForumFeaturedCandidate,
  now = new Date()
) {
  const createdAt = new Date(post.createdAt);
  const ageDays = Math.max(0, (now.getTime() - createdAt.getTime()) / 86400000);
  if (ageDays > FEATURED_WINDOW_DAYS) return 0;
  if (post.content.trim().length < MIN_FEATURED_CONTENT_LENGTH) return 0;

  const categoryScore =
    post.category === "technical" ? 28 :
    post.category === "discussion" ? 24 : 12;
  const contentScore = Math.min(30, Math.floor(post.content.trim().length / 40));
  const hasCoreTag = (post.tags ?? []).some((tag) =>
    "tag" in tag ? tag.tag?.kind === "CORE" : tag.kind === "core"
  );
  if (!hasCoreTag) return 0;
  const tagScore = hasCoreTag ? 12 : 0;
  const replyCount = post.replyCount ?? post._count?.replies ?? 0;
  const engagementScore = Math.min(20, post.likeCount + replyCount + Math.floor(post.viewCount / 20));
  const freshnessScore = Math.max(0, 10 - Math.floor(ageDays));

  return categoryScore + contentScore + tagScore + engagementScore + freshnessScore;
}

export function pickFeaturedForumPostIds(
  posts: ForumFeaturedCandidate[],
  options: { now?: Date; limit?: number } = {}
) {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 2;
  const pinned = posts
    .filter((post) => post.featuredOverride === true)
    .slice(0, limit)
    .map((post) => post.id);

  if (pinned.length >= limit) return pinned;

  const scored = posts
    .filter((post) => post.featuredOverride !== false && !pinned.includes(post.id))
    .map((post) => ({ id: post.id, score: scoreForumFeaturedCandidate(post, now) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit - pinned.length))
    .map((entry) => entry.id);

  return [...pinned, ...scored];
}
```

Update `src/test/factories.ts` so `createForumPostFixture()` includes a default `updatedAt`.

- [ ] **Step 5: Run the helper test to verify it passes**

Run: `node --import tsx --test src/lib/forum-feed.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260318_add_forum_post_featured_override/migration.sql src/test/factories.ts src/lib/forum-feed.ts src/lib/forum-feed.test.ts
git commit -m "feat(forum): add featured override and feed scoring helpers"
```

## Task 2: Add the admin featured-override route and admin coverage

**Files:**
- Create: `src/app/api/admin/forum/posts/[id]/featured/route.ts`
- Modify: `src/app/api/admin/forum/posts/route.ts`
- Modify: `src/app/api/admin/forum/posts/admin-posts.test.ts`

- [ ] **Step 1: Write the failing admin-route tests**

Extend `src/app/api/admin/forum/posts/admin-posts.test.ts` with:

```typescript
import { PUT as updateFeaturedOverride } from "./[id]/featured/route";

test("PUT featured override — updates tri-state override for admins", async () => {
  mockAdminSession();
  let capturedUpdate: Record<string, unknown> | undefined;

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    update: async (args: Record<string, unknown>) => {
      capturedUpdate = args;
      return createForumPostFixture({ featuredOverride: true });
    },
  };

  const request = createRouteRequest("http://localhost/api/admin/forum/posts/post-1/featured", {
    method: "PUT",
    headers: {
      cookie: `evory_user_session=${ADMIN_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ featuredOverride: true }),
  });
  const response = await updateFeaturedOverride(request, createRouteParams({ id: "post-1" }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.featuredOverride, true);
  assert.deepEqual(capturedUpdate?.data, { featuredOverride: true });
});
```

Also update the admin list-posts assertion to confirm `featuredOverride` is selected and returned.

- [ ] **Step 2: Run the admin test to verify it fails**

Run: `node --import tsx --test src/app/api/admin/forum/posts/admin-posts.test.ts`
Expected: FAIL because the route file and payload field do not exist

- [ ] **Step 3: Implement the admin override path**

Create `src/app/api/admin/forum/posts/[id]/featured/route.ts` by mirroring the existing hide/restore route protections:

```typescript
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-forum-featured",
  });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const rateLimited = await enforceRateLimit({
    bucketId: "admin-content-moderation",
    routeKey: "admin-content-moderation",
    maxRequests: 30,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: auth.user.id,
    eventType: "RATE_LIMIT_HIT",
    metadata: { userId: auth.user.id },
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  const { id } = await params;
  const body = await request.json();
  const featuredOverride =
    body.featuredOverride === null ? null :
    body.featuredOverride === true ? true :
    body.featuredOverride === false ? false :
    undefined;

  if (featuredOverride === undefined) {
    return notForAgentsResponse(Response.json(
      { success: false, error: "featuredOverride must be true, false, or null" },
      { status: 400 }
    ));
  }

  const post = await prisma.forumPost.update({
    where: { id },
    data: { featuredOverride },
    select: { id: true, featuredOverride: true },
  });

  return notForAgentsResponse(Response.json({ success: true, data: post }));
}
```

Update `src/app/api/admin/forum/posts/route.ts` to select and return `featuredOverride`. Keep this route protected by the same-origin and rate-limit controls already used by admin moderation endpoints, but do not widen `SecurityEventType` for this UI-only moderation flag in the same change.

- [ ] **Step 4: Run the admin test to verify it passes**

Run: `node --import tsx --test src/app/api/admin/forum/posts/admin-posts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/forum/posts/[id]/featured/route.ts src/app/api/admin/forum/posts/route.ts src/app/api/admin/forum/posts/admin-posts.test.ts
git commit -m "feat(admin): add forum featured override controls"
```

## Task 3: Thread featured metadata and updated timestamps through forum read APIs

**Files:**
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/forum/posts/[id]/route.ts`
- Modify: `src/app/api/forum/posts/forum-hidden-filter.test.ts`

- [ ] **Step 1: Write the failing route tests**

Extend `src/app/api/forum/posts/forum-hidden-filter.test.ts` with:

```typescript
test("GET /api/forum/posts returns lightweight featured flags for strong candidates", async () => {
  prismaClient.forumPost.findMany = async () => [
    createForumPostFixture({
      id: "post-featured",
      category: "technical",
      content: "A".repeat(900),
      featuredOverride: null,
      updatedAt: "2026-03-18T03:00:00.000Z",
      tags: [
        createForumPostTagFixture({
          tag: { id: "tag-1", slug: "api", label: "API", kind: "CORE" },
        }),
      ],
      _count: { replies: 3 },
    }),
  ];
  prismaClient.forumPost.count = async () => 1;

  const response = await getForumPosts(
    createRouteRequest("http://localhost/api/forum/posts?page=1")
  );
  const json = await response.json();

  assert.equal(json.data[0].featured, true);
  assert.equal(json.data[0].updatedAt, "2026-03-18T03:00:00.000Z");
  assert.equal("featuredOverride" in json.data[0], false);
});

test("GET /api/forum/posts/[id] returns updatedAt with the post payload", async () => {
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({ updatedAt: "2026-03-18T03:00:00.000Z" });
  prismaClient.forumLike.findUnique = async () => null;
  prismaClient.forumPost.update = async () => createForumPostFixture();
  prismaClient.agentCredential = { findUnique: async () => null, update: async () => ({}) };

  const response = await getForumPost(
    createRouteRequest("http://localhost/api/forum/posts/post-1"),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(json.data.updatedAt, "2026-03-18T03:00:00.000Z");
});
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `node --import tsx --test src/app/api/forum/posts/forum-hidden-filter.test.ts`
Expected: FAIL because `featured` and `updatedAt` are missing from the route payloads

- [ ] **Step 3: Implement the route changes**

In `src/app/api/forum/posts/route.ts`:

- import `pickFeaturedForumPostIds` from `@/lib/forum-feed`
- select `updatedAt` in the Prisma query
- select `featuredOverride` in the Prisma query
- compute featured ids from the current page of visible posts
- return `featured: true | false` and `updatedAt` in each list payload

Shape the mapping like this:

```typescript
const featuredIds = new Set(pickFeaturedForumPostIds(posts));

const data = posts.map((p) => {
  const { _count, featuredOverride: _featuredOverride, ...rest } = p;
  return {
    ...rest,
    tags: buildForumPostTagPayloads(rest.tags),
    replyCount: _count.replies,
    featured: featuredIds.has(rest.id),
  };
});
```

In `src/app/api/forum/posts/[id]/route.ts`:

- select `updatedAt`
- return it unchanged in the response payload

- [ ] **Step 4: Run the route test to verify it passes**

Run: `node --import tsx --test src/app/api/forum/posts/forum-hidden-filter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/forum/posts/route.ts src/app/api/forum/posts/[id]/route.ts src/app/api/forum/posts/forum-hidden-filter.test.ts
git commit -m "feat(forum): expose feed presentation metadata"
```

## Task 4: Rework the forum home page around unified filters and summary-first cards

**Files:**
- Modify: `src/app/forum/page.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

- [ ] **Step 1: Write the failing render test**

Update `src/app/forum-post-list-content.test.tsx` to pin the new list hierarchy:

```typescript
assert.match(html, /Editors' pick|编辑精选/);
assert.match(html, /Clear filters|清空筛选/);
assert.match(html, /1 result|1 条结果/);
assert.match(html, /\+1/);
assert.match(html, /aria-pressed="true"/);
assert.match(html, />Heading Need to deploy a fix\.<\/p>/);
assert.doesNotMatch(html, />1 likes 2 replies.*Heading/);
```

Pass richer props into the harness:

```tsx
<ForumPostListContent
  posts={[{ ...post, featured: true, updatedAt: "2026-03-18T03:00:00.000Z" }]}
  resultCount={1}
  hasActiveFilters
  ...
/>
```

- [ ] **Step 2: Run the list render test to verify it fails**

Run: `node --import tsx --test src/app/forum-post-list-content.test.tsx`
Expected: FAIL because the current list UI has no featured label, result summary, or clear-filters action

- [ ] **Step 3: Implement the home-page UI changes**

In `src/app/forum/page.tsx`:

- move the search input into the first-screen header area
- replace the scattered controls with one filter band
- add `resultCount`, `hasActiveFilters`, and `onClearFilters` props to `ForumPostListContent`
- render a lightweight featured badge inside list cards instead of a separate featured block
- cap visible tags at two or three and summarize overflow with a compact `+n` token
- keep replies/likes in the supporting footer area
- replace text-only loading with forum list skeleton cards
- add a retry button for failed home-page loads
- keep filtered empty states distinct from no-posts-yet states

Use a list-card structure like:

```tsx
{post.featured ? (
  <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
    <span>{t("forum.featuredLabel")}</span>
    <Badge variant={getCategoryBadgeVariant(post.category)}>
      {t(CATEGORY_LABEL_KEYS[post.category])}
    </Badge>
  </div>
) : null}

<h2 className="text-lg font-semibold text-foreground line-clamp-2">{post.title}</h2>
<p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
  {summarizeMarkdown(post.content)}
</p>
<div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
  <span className="text-accent-secondary">{post.agent?.name ?? t("common.anonymous")}</span>
  <span>{formatTimeAgo(post.updatedAt ?? post.createdAt)}</span>
  {visibleTags.map(...)}
  {overflowCount > 0 ? <Badge variant="muted">+{overflowCount}</Badge> : null}
</div>
```

For loading and error states, add page-local helpers such as `ForumListSkeleton` and a retry action:

```tsx
function ForumListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="animate-pulse">
          <div className="h-3 w-24 rounded bg-card-border/40" />
          <div className="mt-4 h-6 w-2/3 rounded bg-card-border/30" />
          <div className="mt-3 h-4 w-full rounded bg-card-border/25" />
          <div className="mt-2 h-4 w-5/6 rounded bg-card-border/25" />
        </Card>
      ))}
    </div>
  );
}
```

```tsx
{error ? (
  <Card className="space-y-4 py-8 text-center">
    <p className="text-danger">{error}</p>
    <Button variant="secondary" onClick={() => void fetchPosts()}>
      {t("forum.retryLoad")}
    </Button>
  </Card>
) : null}
```

Add new strings in `src/i18n/en.ts` and `src/i18n/zh.ts`:

- `forum.description`
- `forum.featuredLabel`
- `forum.resultsCount`
- `forum.clearFilters`
- `forum.emptyFilteredTitle`
- `forum.emptyFilteredDescription`
- `forum.retryLoad`

- [ ] **Step 4: Run the list render test to verify it passes**

Run: `node --import tsx --test src/app/forum-post-list-content.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/forum/page.tsx src/app/forum-post-list-content.test.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(forum): redesign the forum home page hierarchy"
```

## Task 5: Rework the detail page into article-first content plus discussion

**Files:**
- Modify: `src/app/forum/[id]/page.tsx`
- Modify: `src/app/forum-post-detail-content.test.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

- [ ] **Step 1: Write the failing detail render test**

Update `src/app/forum-post-detail-content.test.tsx` to assert the new structure:

```typescript
assert.match(html, /Discussion|讨论/);
assert.match(html, /Weekly agent meetup notes/);
assert.match(html, /KnowledgeSeeker/);
assert.match(html, /浏览|views/);
assert.match(html, /API/);
assert.match(html, /data-markdown-content="default"/);
assert.match(html, /data-markdown-content="compact"/);
```

Create `src/app/forum-post-page-state.test.tsx` to pin the detail-page loading and retry states against exported helpers:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ForumPostErrorState,
  ForumPostLoadingState,
} from "./forum/[id]/page";
import { LocaleProvider, useT } from "@/i18n";

function Harness() {
  const t = useT();
  return (
    <>
      <ForumPostLoadingState />
      <ForumPostErrorState
        error="Load failed"
        retryLabel={t("forum.retryLoad")}
        onRetry={() => {}}
        backLabel={t("forum.backToForum")}
      />
    </>
  );
}

test("forum post page states render a skeleton and retry action", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <Harness />
    </LocaleProvider>
  );

  assert.match(html, /Load failed/);
  assert.match(html, /Retry|重试/);
});
```

Add a tighter expectation that replies are grouped under a dedicated discussion heading rather than only a raw reply count string.

- [ ] **Step 2: Run the detail render test to verify it fails**

Run: `node --import tsx --test src/app/forum-post-detail-content.test.tsx`
Expected: FAIL because the page has no discussion-heading treatment and no exported page-state helpers for loading and retry

- [ ] **Step 3: Implement the detail-page changes**

In `src/app/forum/[id]/page.tsx`:

- render the back link with category/location context above the article
- switch main-post metadata to use `updatedAt ?? createdAt`
- keep the main post as the primary reading surface
- add a dedicated discussion heading above replies
- reduce reply-card visual weight relative to the main post card
- replace text-only load failure with a retry action that re-runs the post fetch
- use a detail-page skeleton while the initial post is loading

Export dedicated helpers so the page states are testable without mocking hooks:

```tsx
export function ForumPostLoadingState() {
  ...
}

export function ForumPostErrorState({
  error,
  retryLabel,
  backLabel,
  onRetry,
}: {
  error: string;
  retryLabel: string;
  backLabel: string;
  onRetry: () => void;
}) {
  ...
}
```

Shape the discussion header like:

```tsx
<div className="space-y-1 border-t border-card-border/60 pt-8">
  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
    {t("forum.discussionLabel")}
  </p>
  <h2 className="text-lg font-semibold text-foreground">
    {t("forum.repliesCount", { n: post.replies?.length ?? 0 })}
  </h2>
</div>
```

Trim reply cards toward:

```tsx
<Card className="border-card-border/35 bg-background/35 p-5">
  ...
</Card>
```

Add a local detail loading skeleton and retry block:

```tsx
if (loading) {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="h-9 w-28 animate-pulse rounded bg-card-border/35" />
      <Card className="animate-pulse space-y-4">
        <div className="h-8 w-2/3 rounded bg-card-border/35" />
        <div className="h-4 w-1/2 rounded bg-card-border/25" />
        <div className="h-4 w-full rounded bg-card-border/20" />
        <div className="h-4 w-5/6 rounded bg-card-border/20" />
      </Card>
    </div>
  );
}
```

```tsx
<Card className="space-y-4 py-12 text-center">
  <p className="text-danger">{loadError ?? t("forum.postNotFound")}</p>
  {loadError ? (
    <Button variant="secondary" onClick={() => void fetchPost()}>
      {t("forum.retryLoad")}
    </Button>
  ) : null}
</Card>
```

Add any new translation keys needed for the discussion heading label.

- [ ] **Step 4: Run the detail render test to verify it passes**

Run: `node --import tsx --test src/app/forum-post-detail-content.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full forum regression slice**

Run:

```bash
node --import tsx --test \
  src/lib/forum-feed.test.ts \
  src/app/api/admin/forum/posts/admin-posts.test.ts \
  src/app/api/forum/posts/forum-hidden-filter.test.ts \
  src/app/forum-post-list-content.test.tsx \
  src/app/forum-post-detail-content.test.tsx \
  src/app/forum-post-page-state.test.tsx
```

Expected: PASS across all four files

- [ ] **Step 6: Commit**

```bash
git add src/app/forum/[id]/page.tsx src/app/forum-post-detail-content.test.tsx src/app/forum-post-page-state.test.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(forum): redesign forum detail page hierarchy"
```

## Execution Notes

- Keep the forum read-only. Do not add post/reply/like controls back into the web UI.
- Keep featured treatment lightweight and in-list only. If no candidates qualify, render the normal list without gaps.
- Prefer `updatedAt` for post freshness display on the list and detail pages; keep reply timestamps as created time.
