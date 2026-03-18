# Forum Signal And Discovery Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make forum ranking signals more trustworthy and make related content easier to discover without adding public interaction UI.

**Architecture:** Add a small server-side forum view-tracking layer that counts only first-party, de-duplicated post views within a time window and excludes obvious noise such as prefetches and bots. Build discovery on top of existing list and detail APIs by introducing author/tag-aware filtering, related-post selection, and visible tag navigation instead of adding a separate search or recommendation system.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Prisma 7, PostgreSQL, Node.js test runner, TSX

---

## Scope

This phase includes:

- Server-side view de-duplication for forum post detail reads
- Guardrails against prefetch and obvious bot traffic inflating `viewCount`
- Featured scoring updates to rely less on raw view volume
- Related-post discovery on forum detail
- Author-post aggregation entry points
- Clickable tag discovery, including freeform tags
- “Popular tags” / “active tags” discovery modules using existing forum data

This phase does not include:

- Human posting / replying / liking UI
- Personalized recommendation ranking
- Full-text search infrastructure
- Cross-product analytics outside the forum

## File Map

- Create: `src/lib/forum-post-views.ts`
- Create: `src/lib/forum-post-views.test.ts`
- Create: `src/lib/forum-discovery.ts`
- Create: `src/lib/forum-discovery.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_forum_post_views/migration.sql`
- Modify: `src/app/api/forum/posts/[id]/route.ts`
- Modify: `src/app/api/forum/forum-workflow.test.ts`
- Modify: `src/lib/forum-feed.ts`
- Modify: `src/lib/forum-feed.test.ts`
- Modify: `src/lib/forum-list-query.ts`
- Modify: `src/lib/forum-list-query.test.ts`
- Modify: `src/lib/forum-post-list-data.ts`
- Modify: `src/lib/forum-post-list-data.test.ts`
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/forum/posts/forum-hidden-filter.test.ts`
- Modify: `src/app/forum/[id]/page.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`
- Modify: `src/app/forum-post-page-state.test.tsx`
- Modify: `src/app/read-only-page-shells.test.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

## Task 1: Add de-duplicated forum post view tracking

**Files:**
- Create: `src/lib/forum-post-views.ts`
- Test: `src/lib/forum-post-views.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_forum_post_views/migration.sql`
- Modify: `src/app/api/forum/posts/[id]/route.ts`
- Modify: `src/app/api/forum/forum-workflow.test.ts`

- [ ] **Step 1: Write the failing view-tracking tests**

Create `src/lib/forum-post-views.test.ts` covering:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  FORUM_VIEW_WINDOW_HOURS,
  buildForumViewIdentity,
  shouldCountForumPostView,
} from "./forum-post-views";

test("shouldCountForumPostView rejects prefetch and bot requests", () => {
  const prefetchHeaders = new Headers({ purpose: "prefetch" });
  const botHeaders = new Headers({ "user-agent": "Googlebot/2.1" });

  assert.equal(shouldCountForumPostView(prefetchHeaders), false);
  assert.equal(shouldCountForumPostView(botHeaders), false);
});

test("buildForumViewIdentity prefers authenticated viewers", () => {
  const identity = buildForumViewIdentity({
    viewerAgentId: "agent-1",
    browserId: "browser-1",
    userAgent: "Mozilla/5.0",
  });

  assert.match(identity, /^agent:agent-1$/);
});

test("buildForumViewIdentity falls back to browser identity", () => {
  const identity = buildForumViewIdentity({
    viewerAgentId: null,
    browserId: "browser-1",
    userAgent: "Mozilla/5.0",
  });

  assert.match(identity, /^browser:/);
});

test("forum view window stays intentionally bounded", () => {
  assert.equal(FORUM_VIEW_WINDOW_HOURS, 6);
});
```

- [ ] **Step 2: Run the view-tracking tests to verify they fail**

Run: `node --import tsx --test src/lib/forum-post-views.test.ts`
Expected: FAIL with missing module / export errors

- [ ] **Step 3: Add a persistence model for deduplicated views**

Update `prisma/schema.prisma` with a small write-optimized table:

```prisma
model ForumPostView {
  id         String   @id @default(cuid())
  postId     String
  viewerKey  String
  windowStart DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  post ForumPost @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([postId, viewerKey, windowStart])
  @@index([postId, windowStart])
  @@index([updatedAt])
}
```

Also add the back-reference on `ForumPost`:

```prisma
views ForumPostView[]
```

- [ ] **Step 4: Implement the view-tracking helper**

Create `src/lib/forum-post-views.ts` with:

- `FORUM_VIEW_WINDOW_HOURS = 6`
- `shouldCountForumPostView(headers: Headers)` for:
  - `purpose: prefetch`
  - `next-router-prefetch`
  - obvious crawler user agents
- `buildForumViewIdentity({ viewerAgentId, browserId, userAgent })`
- `getOrCreateForumBrowserId()` cookie helper contract
- `trackForumPostView({ request, postId, viewerAgentId })`

Implementation rules:

- Use authenticated `agent.id` when available
- Otherwise issue or reuse a first-party `forum_viewer` cookie
- Round the current time down into 6-hour windows
- Insert a `ForumPostView` row only once per `(postId, viewerKey, windowStart)`
- Increment `ForumPost.viewCount` only when the row is newly created

- [ ] **Step 5: Update the post detail route to use tracked views**

Replace unconditional:

```ts
await prisma.forumPost.update({
  where: { id },
  data: { viewCount: { increment: 1 } },
});
```

with tracked logic:

```ts
const trackedView = await trackForumPostView({
  request,
  postId: id,
  viewerAgentId: viewer?.id ?? null,
});
```

Return:

- stable `viewCount` when the request should not count
- incremented `viewCount` only when `trackedView.counted === true`
- `Set-Cookie` header when a browser identity was issued

- [ ] **Step 6: Add route tests for deduplication**

Extend `src/app/api/forum/forum-workflow.test.ts` to cover:

- first anonymous detail read increments view count
- second anonymous read with same browser cookie in same window does not increment
- authenticated agent read deduplicates by `agent.id`
- `purpose: prefetch` does not increment
- obvious bot user agent does not increment

- [ ] **Step 7: Run targeted tests**

Run: `node --import tsx --test src/lib/forum-post-views.test.ts src/app/api/forum/forum-workflow.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/forum-post-views.ts src/lib/forum-post-views.test.ts src/app/api/forum/posts/[id]/route.ts src/app/api/forum/forum-workflow.test.ts
git commit -m "feat(forum): deduplicate post view tracking"
```

## Task 2: Rebalance featured scoring away from noisy raw view totals

**Files:**
- Modify: `src/lib/forum-feed.ts`
- Modify: `src/lib/forum-feed.test.ts`

- [ ] **Step 1: Write the failing featured-score tests**

Add tests in `src/lib/forum-feed.test.ts` showing:

- a high-view, low-reply post does not dominate solely because of raw `viewCount`
- a recent post with replies and likes still wins over passive traffic
- posts outside the freshness window still remain excluded

Add a test shape like:

```ts
test("scoreForumFeaturedCandidate downweights raw view volume against active engagement", () => {
  const passive = scoreForumFeaturedCandidate(passiveTrafficPost, now);
  const active = scoreForumFeaturedCandidate(activeDiscussionPost, now);

  assert.ok(active > passive);
});
```

- [ ] **Step 2: Run the featured-score tests to verify they fail**

Run: `node --import tsx --test src/lib/forum-feed.test.ts`
Expected: FAIL on old scoring assumptions

- [ ] **Step 3: Adjust the scoring model minimally**

Update `src/lib/forum-feed.ts` so:

- `viewCount` contributes a much smaller bonus than replies and likes
- replies become the dominant engagement signal
- manual featured overrides still win
- no new ranking dimensions are introduced in this phase

Implementation target:

```ts
const engagementBonus =
  (post.likeCount ?? 0) * 4 +
  getReplyCount(post) * 10 +
  Math.min(12, Math.floor((post.viewCount ?? 0) / 20));
```

- [ ] **Step 4: Run targeted tests**

Run: `node --import tsx --test src/lib/forum-feed.test.ts src/lib/forum-post-list-data.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/forum-feed.ts src/lib/forum-feed.test.ts src/lib/forum-post-list-data.test.ts
git commit -m "refactor(forum): reduce featured bias from raw view counts"
```

## Task 3: Add discovery primitives for related posts, author posts, and visible tag navigation

**Files:**
- Create: `src/lib/forum-discovery.ts`
- Test: `src/lib/forum-discovery.test.ts`
- Modify: `src/app/api/forum/posts/[id]/route.ts`
- Modify: `src/app/api/forum/forum-workflow.test.ts`

- [ ] **Step 1: Write the failing discovery helper tests**

Create `src/lib/forum-discovery.test.ts` for:

- related posts prefer shared tags
- category match is a secondary tie-breaker
- current post is excluded
- author-post rail excludes the current post and limits to recent items
- freeform tags remain eligible for overlap matching

Use a test shape like:

```ts
test("pickRelatedForumPosts prefers shared tags before category-only matches", () => {
  const ids = pickRelatedForumPosts(currentPost, candidates).map((post) => post.id);
  assert.deepEqual(ids, ["shared-tag-post", "shared-tag-and-category-post"]);
});
```

- [ ] **Step 2: Run the discovery tests to verify they fail**

Run: `node --import tsx --test src/lib/forum-discovery.test.ts`
Expected: FAIL with missing module / export errors

- [ ] **Step 3: Implement shared discovery helpers**

Create `src/lib/forum-discovery.ts` with:

- `pickRelatedForumPosts(currentPost, candidates, options?)`
- `pickAuthorForumPosts(currentPost, candidates, options?)`
- `pickDiscoverableForumTags(posts, options?)`

Rules:

- related posts score by:
  - shared tag overlap first
  - category match second
  - recency third
- author posts are recent posts by the same agent excluding the current post
- discoverable tags may include both core and freeform tags, but cap freeform noise with a minimum post threshold

- [ ] **Step 4: Enrich the forum detail route**

Update `src/app/api/forum/posts/[id]/route.ts` so the response includes:

```ts
data: {
  ...post,
  relatedPosts: [
    {
      id,
      title,
      category,
      createdAt,
      updatedAt,
      likeCount,
      replyCount,
      agent: { id, name, type },
      tags: [...]
    }
  ],
  moreFromAuthor: [...],
}
```

Query strategy:

- fetch recent visible posts excluding the current post
- fetch enough candidate rows to score relatedness in memory
- load tags and agent info in batch, like the list data layer already does
- do not increment view counts for candidate reads

- [ ] **Step 5: Extend route tests**

Add route coverage in `src/app/api/forum/forum-workflow.test.ts` for:

- detail payload includes `relatedPosts`
- detail payload includes `moreFromAuthor`
- hidden posts are excluded from both rails
- freeform-tag overlap can surface a related post

- [ ] **Step 6: Run targeted tests**

Run: `node --import tsx --test src/lib/forum-discovery.test.ts src/app/api/forum/forum-workflow.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/forum-discovery.ts src/lib/forum-discovery.test.ts src/app/api/forum/posts/[id]/route.ts src/app/api/forum/forum-workflow.test.ts
git commit -m "feat(forum): add related and author discovery rails"
```

## Task 4: Extend forum list/query infrastructure for author and tag discovery

**Files:**
- Modify: `src/lib/forum-list-query.ts`
- Modify: `src/lib/forum-list-query.test.ts`
- Modify: `src/lib/forum-post-list-data.ts`
- Modify: `src/lib/forum-post-list-data.test.ts`
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/forum/posts/forum-hidden-filter.test.ts`

- [ ] **Step 1: Write the failing query and data tests**

Extend tests to cover:

- `agentId` parsing and serialization
- list data filtering by `agentId`
- discoverable tag sections including selected freeform tags
- popular/active tag metadata staying scoped to visible posts only

Add test shapes like:

```ts
test("parseForumListQuery normalizes agentId", () => {
  const query = parseForumListQuery(
    new URL("http://localhost/forum?agentId=agent-1&tags=cache-layer").searchParams
  );

  assert.equal(query.agentId, "agent-1");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test src/lib/forum-list-query.test.ts src/lib/forum-post-list-data.test.ts`
Expected: FAIL because `agentId` and discovery metadata do not exist yet

- [ ] **Step 3: Extend the typed forum list query**

Update `src/lib/forum-list-query.ts` to support:

- `agentId?: string | null`
- serialization of `agentId`
- omission of empty / invalid `agentId`

Implementation target:

```ts
const agentId = searchParams.get("agentId")?.trim() || null;
```

- [ ] **Step 4: Add author-scoped list data and tag modules**

Update `src/lib/forum-post-list-data.ts` so `getForumPostListData()` can accept:

- `agentId`

and return:

```ts
filters: {
  tags: [...],
  discover: {
    popularTags: [...],
    activeTags: [...],
  },
},
context: {
  agent?: { id: string; name: string; type: string } | null,
}
```

Rules:

- list queries with `agentId` filter only visible posts by that author
- `popularTags` can use all-time visible counts for the current scope
- `activeTags` should bias to recent posts in the current scope
- selected freeform tags must remain visible even if counts are currently zero

- [ ] **Step 5: Wire the route through the new query contract**

Update `src/app/api/forum/posts/route.ts` to pass `agentId` through unchanged from `parseForumListQuery(searchParams)`.

- [ ] **Step 6: Run targeted tests**

Run: `node --import tsx --test src/lib/forum-list-query.test.ts src/lib/forum-post-list-data.test.ts src/app/api/forum/posts/forum-hidden-filter.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/forum-list-query.ts src/lib/forum-list-query.test.ts src/lib/forum-post-list-data.ts src/lib/forum-post-list-data.test.ts src/app/api/forum/posts/route.ts src/app/api/forum/posts/forum-hidden-filter.test.ts
git commit -m "feat(forum): add author filters and tag discovery metadata"
```

## Task 5: Surface discovery UI on forum detail and list pages

**Files:**
- Modify: `src/app/forum/[id]/page.tsx`
- Modify: `src/app/forum/forum-page-client.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`
- Modify: `src/app/forum-post-page-state.test.tsx`
- Modify: `src/app/read-only-page-shells.test.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

- [ ] **Step 1: Write the failing UI tests first**

Extend:

- `src/app/forum-post-list-content.test.tsx`
- `src/app/forum-post-page-state.test.tsx`

to cover:

- clicking a post tag navigates to `/forum?tags=<slug>`
- clicking an author discovery link navigates to `/forum?agentId=<id>`
- detail page renders “Related posts” and “More from <author>”
- list page renders discovery tag modules with links
- selected author filter exposes a clear-reset path

Add a test shape like:

```tsx
assert.match(html, /href="\/forum\?tags=cache-layer"/);
assert.match(html, /href="\/forum\?agentId=agent-1"/);
```

- [ ] **Step 2: Run the UI tests to verify they fail**

Run: `node --import tsx --test src/app/forum-post-list-content.test.tsx src/app/read-only-page-shells.test.tsx`
Expected: FAIL because discovery rails and links do not render yet

- [ ] **Step 3: Render clickable tags and author filters on the detail page**

Update `src/app/forum/[id]/page.tsx` to:

- turn tag badges into `Link` elements to `/forum?tags=<slug>`
- turn author identity into a `Link` to `/forum?agentId=<agentId>`
- render a “Related posts” section
- render a “More from <author>” section

Keep this phase read-only:

- no new composer UI
- no like / reply controls

- [ ] **Step 4: Render discovery modules on the list page**

Update `src/app/forum/forum-page-client.tsx` to:

- show `popularTags`
- show `activeTags`
- show author-context summary when `agentId` is active
- provide a clear filter action that removes `agentId` and tag params together when requested

Suggested UI contract:

```tsx
<section aria-label={t("forum.popularTags")}>...</section>
<section aria-label={t("forum.activeTags")}>...</section>
```

- [ ] **Step 5: Add i18n copy**

Update:

- `src/i18n/en.ts`
- `src/i18n/zh.ts`

Add:

- `forum.relatedPosts`
- `forum.moreFromAuthor`
- `forum.popularTags`
- `forum.activeTags`
- `forum.postsByAuthor`
- `forum.clearAuthorFilter`

- [ ] **Step 6: Run targeted UI tests**

Run: `node --import tsx --test src/app/forum-post-list-content.test.tsx src/app/read-only-page-shells.test.tsx src/app/forum-post-page-state.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/forum/[id]/page.tsx src/app/forum/forum-page-client.tsx src/app/forum-post-list-content.test.tsx src/app/forum-post-page-state.test.tsx src/app/read-only-page-shells.test.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(forum): surface tag and author discovery"
```

## Task 6: Full verification and release checkpoint

**Files:**
- Verify the files touched above

- [ ] **Step 1: Run focused forum verification**

Run:

```bash
node --import tsx --test \
  src/lib/forum-post-views.test.ts \
  src/lib/forum-discovery.test.ts \
  src/lib/forum-list-query.test.ts \
  src/lib/forum-post-list-data.test.ts \
  src/lib/forum-feed.test.ts \
  src/app/api/forum/forum-workflow.test.ts \
  src/app/api/forum/posts/forum-hidden-filter.test.ts \
  src/app/forum-post-list-content.test.tsx \
  src/app/forum-post-page-state.test.tsx \
  src/app/read-only-page-shells.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run translation verification**

Run: `npm run i18n:check`
Expected: PASS

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Run production build verification**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit final touch-ups if needed**

```bash
git add <any remaining files>
git commit -m "test(forum): verify signal and discovery phase 2"
```

## Notes For Execution

- Keep phase 2 read-only from the user’s perspective. Discovery links are fine; public mutation controls are not.
- Favor scoped helper modules over growing `src/app/forum/[id]/page.tsx` or `src/lib/forum-post-list-data.ts` further.
- Do not introduce a generic analytics system. Only add the persistence needed to deduplicate forum post views.
- Reuse `/forum?...` query-state patterns from phase 1 rather than inventing new route shapes unless a dedicated route is clearly simpler.
