# Forum Discovery And Curation Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the forum from a basic read-only post list into a shareable, sortable, curator-friendly knowledge stream without adding public write UI in this phase.

**Architecture:** Keep the current read-only forum model, but move discovery state into URL query params, add a typed list-query layer for category and sort validation, and upgrade the feed pipeline so featured signals are computed from a global candidate set instead of only the current page. On the operations side, surface the already-existing featured and tag moderation APIs in the admin UI so editorial control is actually usable.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Prisma 7, Node.js test runner, TSX

---

## Scope

This phase includes:

- URL-driven forum filters and pagination
- Sort modes for discovery
- Global featured selection
- Category validation and request hardening
- Admin UI for featured override and tag editing

This phase does not include:

- Public human posting / replying / liking UI
- Full-text search infrastructure
- Personalized recommendation ranking
- View-count deduplication / anti-bot analytics

## File Map

- Create: `src/lib/forum-list-query.ts`
- Create: `src/lib/forum-list-query.test.ts`
- Modify: `src/lib/forum-post-list-data.ts`
- Modify: `src/lib/forum-post-list-data.test.ts`
- Modify: `src/lib/forum-feed.ts`
- Modify: `src/lib/forum-feed.test.ts`
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/forum/posts/forum-hidden-filter.test.ts`
- Modify: `src/app/forum/page.tsx`
- Modify: `src/app/forum/forum-page-client.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`
- Modify: `src/app/forum-post-page-state.test.tsx`
- Modify: `src/app/api/forum/posts/[id]/route.ts`
- Modify: `src/app/api/forum/forum-workflow.test.ts`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/api/admin/forum/posts/admin-posts.test.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

## Task 1: Add a typed forum list-query layer

**Files:**
- Create: `src/lib/forum-list-query.ts`
- Test: `src/lib/forum-list-query.test.ts`
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/forum/page.tsx`

- [ ] **Step 1: Write the failing parser tests**

Create `src/lib/forum-list-query.test.ts` covering:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  FORUM_CATEGORIES,
  FORUM_SORTS,
  parseForumListQuery,
  serializeForumListQuery,
} from "./forum-list-query";

test("parseForumListQuery normalizes page, q, category, tags, and sort", () => {
  const result = parseForumListQuery(
    new URL("http://localhost/forum?page=2&category=technical&sort=top&tags=api,testing&q= timeout ").searchParams
  );

  assert.deepEqual(result, {
    page: 2,
    pageSize: 20,
    category: "technical",
    sort: "top",
    q: "timeout",
    selectedTagSlugs: ["api", "testing"],
  });
});

test("parseForumListQuery falls back for invalid category and sort", () => {
  const result = parseForumListQuery(
    new URL("http://localhost/forum?category=weird&sort=chaos").searchParams
  );

  assert.equal(result.category, null);
  assert.equal(result.sort, "latest");
});

test("serializeForumListQuery omits defaults", () => {
  assert.equal(
    serializeForumListQuery({
      page: 1,
      pageSize: 20,
      category: null,
      sort: "latest",
      q: "",
      selectedTagSlugs: [],
    }).toString(),
    ""
  );
});

test("forum query enums stay intentionally small", () => {
  assert.deepEqual(FORUM_CATEGORIES, ["general", "technical", "discussion"]);
  assert.deepEqual(FORUM_SORTS, ["latest", "active", "top"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test src/lib/forum-list-query.test.ts`
Expected: FAIL with missing module / export errors

- [ ] **Step 3: Implement the query module**

Create `src/lib/forum-list-query.ts` with:

- `FORUM_CATEGORIES`
- `FORUM_SORTS`
- `type ForumSort = "latest" | "active" | "top"`
- `parseForumListQuery(searchParams)`
- `serializeForumListQuery(input)`

Key rules:

- Default `page=1`, `pageSize=20`
- `category` only accepts the known categories, else `null`
- `sort` only accepts `latest`, `active`, `top`, else `latest`
- `q` is trimmed
- tags reuse `parseForumTagFilters`
- serialization omits default values so URLs stay clean

- [ ] **Step 4: Route all forum list entry points through the parser**

Update:

- `src/app/api/forum/posts/route.ts` to use `parseForumListQuery(searchParams)`
- `src/app/forum/page.tsx` to accept `searchParams` and build initial data from the same normalized query

Implementation target:

```ts
const query = parseForumListQuery(searchParams);
const forumData = await getForumPostListData(query);
```

- [ ] **Step 5: Run targeted tests**

Run: `node --import tsx --test src/lib/forum-list-query.test.ts src/app/api/forum/posts/forum-hidden-filter.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/forum-list-query.ts src/lib/forum-list-query.test.ts src/app/api/forum/posts/route.ts src/app/forum/page.tsx src/app/api/forum/posts/forum-hidden-filter.test.ts
git commit -m "feat(forum): add typed list query parsing"
```

## Task 2: Make forum discovery shareable and sortable

**Files:**
- Modify: `src/app/forum/forum-page-client.tsx`
- Modify: `src/app/forum-post-page-state.test.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

- [ ] **Step 1: Extend page-state tests first**

Update `src/app/forum-post-page-state.test.tsx` to cover:

- initial state derived from URL query params
- typing in search updates the URL
- changing category resets page to 1
- changing sort resets page to 1
- toggling tags updates `tags=...`
- clearing filters removes query params

Add a test shape like:

```tsx
render(<ForumPageClient initialData={fixture} initialQuery={...} />);
await user.selectOptions(screen.getByLabelText(/sort/i), "top");
assert.equal(mockReplace.mock.calls.at(-1)?.[0], "/forum?sort=top");
```

- [ ] **Step 2: Run the page-state tests to verify they fail**

Run: `node --import tsx --test src/app/forum-post-page-state.test.tsx`
Expected: FAIL because `ForumPageClient` does not yet accept query-driven state or sort UI

- [ ] **Step 3: Move list state from local-only state to URL-backed state**

Update `src/app/forum/forum-page-client.tsx` to:

- accept `initialQuery`
- initialize `page`, `category`, `searchQuery`, `selectedTagSlugs`, and `sort` from normalized input
- use `useRouter()` + `usePathname()` and `serializeForumListQuery()` to keep URL in sync
- keep `useDeferredValue(searchQuery.trim())`
- preserve the `shouldSkipInitialFetch()` optimization, but include `sort` in the comparison

Add a sort control beside category and result count:

```tsx
<select value={sort} onChange={(event) => onSortChange(event.target.value as ForumSort)}>
  <option value="latest">{t("forum.sortLatest")}</option>
  <option value="active">{t("forum.sortActive")}</option>
  <option value="top">{t("forum.sortTop")}</option>
</select>
```

- [ ] **Step 4: Refine the list-header UI contract**

Adjust the top control band so it contains:

- category tabs
- sort selector
- result count
- clear-filters action

Do not move tag pills into the header yet; keep them below the control band to limit UI churn in phase 1.

- [ ] **Step 5: Add the copy for sort labels**

Update:

- `src/i18n/en.ts`
- `src/i18n/zh.ts`

Add:

- `forum.sortLatest`
- `forum.sortActive`
- `forum.sortTop`

- [ ] **Step 6: Run the UI tests**

Run: `node --import tsx --test src/app/forum-post-page-state.test.tsx src/app/forum-post-list-content.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/forum/forum-page-client.tsx src/app/forum-post-page-state.test.tsx src/app/forum-post-list-content.test.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(forum): make list state URL-driven and sortable"
```

## Task 3: Upgrade feed ranking from page-local to global featured selection

**Files:**
- Modify: `src/lib/forum-post-list-data.ts`
- Modify: `src/lib/forum-post-list-data.test.ts`
- Modify: `src/lib/forum-feed.ts`
- Modify: `src/lib/forum-feed.test.ts`
- Modify: `src/app/api/forum/posts/forum-hidden-filter.test.ts`

- [ ] **Step 1: Write the failing data-layer tests**

Extend `src/lib/forum-post-list-data.test.ts` with:

- `sort=latest` orders by `createdAt desc`
- `sort=active` orders by `updatedAt desc`
- `sort=top` orders by `likeCount desc`, then `replyCount desc`, then `createdAt desc`
- featured IDs are selected from a recent candidate pool, not only the paged rows

Target assertion shape:

```ts
assert.deepEqual(capturedFindManyArgs.orderBy, [
  { likeCount: "desc" },
  { updatedAt: "desc" },
  { createdAt: "desc" },
]);
assert.equal(result.data.some((post) => post.featured), true);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/lib/forum-post-list-data.test.ts src/lib/forum-feed.test.ts`
Expected: FAIL because sort and global featured logic do not exist yet

- [ ] **Step 3: Add sort-aware ordering to the list data loader**

Update `src/lib/forum-post-list-data.ts`:

- accept `sort`
- map sort to Prisma `orderBy`
- include `updatedAt` in ranking for `active`

Recommended order map:

```ts
const orderBy =
  sort === "active"
    ? [{ updatedAt: "desc" }, { createdAt: "desc" }]
    : sort === "top"
      ? [{ likeCount: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }]
      : [{ createdAt: "desc" }];
```

- [ ] **Step 4: Compute featured IDs from a global candidate window**

Refactor `src/lib/forum-post-list-data.ts` so featured scoring uses a second query for recent candidate posts instead of only the current page.

Implementation direction:

- query the latest 100 visible posts matching the current non-page filters
- include the fields required by `pickFeaturedForumPostIds()`
- compute a `featuredPostIds` set from that candidate pool
- annotate the paged result rows using that set

Do not create a separate featured API in this phase.

- [ ] **Step 5: Keep ranking logic focused in `src/lib/forum-feed.ts`**

Only keep scoring and pick helpers in `src/lib/forum-feed.ts`.
Do not leak Prisma-specific query construction into that file.

- [ ] **Step 6: Run targeted tests**

Run: `node --import tsx --test src/lib/forum-post-list-data.test.ts src/lib/forum-feed.test.ts src/app/api/forum/posts/forum-hidden-filter.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/forum-post-list-data.ts src/lib/forum-post-list-data.test.ts src/lib/forum-feed.ts src/lib/forum-feed.test.ts src/app/api/forum/posts/forum-hidden-filter.test.ts
git commit -m "feat(forum): add sortable feed and global featured selection"
```

## Task 4: Harden forum write-side category validation

**Files:**
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/forum/forum-workflow.test.ts`
- Modify: `src/app/api/forum/posts/forum-hidden-filter.test.ts`

- [ ] **Step 1: Write the failing validation tests**

Extend `src/app/api/forum/forum-workflow.test.ts` with:

- valid categories are accepted
- invalid categories return `400`
- omitted category still defaults to `general`

Target assertion:

```ts
assert.equal(response.status, 400);
assert.equal(json.error, "category must be one of general, technical, discussion");
```

- [ ] **Step 2: Run the workflow test to verify it fails**

Run: `node --import tsx --test src/app/api/forum/forum-workflow.test.ts`
Expected: FAIL because invalid categories are currently persisted as-is

- [ ] **Step 3: Reuse the shared category enum in the POST route**

Update `src/app/api/forum/posts/route.ts`:

- import `FORUM_CATEGORIES`
- validate `category` before `prisma.forumPost.create`
- default to `general` when category is missing

Implementation direction:

```ts
const normalizedCategory =
  typeof category === "string" && category.trim() !== ""
    ? category.trim()
    : "general";

if (!FORUM_CATEGORIES.includes(normalizedCategory as (typeof FORUM_CATEGORIES)[number])) {
  return Response.json(
    { success: false, error: "category must be one of general, technical, discussion" },
    { status: 400 }
  );
}
```

- [ ] **Step 4: Run the workflow tests**

Run: `node --import tsx --test src/app/api/forum/forum-workflow.test.ts src/app/api/forum/posts/forum-hidden-filter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/forum/posts/route.ts src/app/api/forum/forum-workflow.test.ts src/app/api/forum/posts/forum-hidden-filter.test.ts
git commit -m "fix(forum): validate allowed post categories"
```

## Task 5: Expose featured and tag curation in the admin UI

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/api/admin/forum/posts/admin-posts.test.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

- [ ] **Step 1: Extend the admin tests first**

Update `src/app/api/admin/forum/posts/admin-posts.test.ts` so the listed post payload assertions cover:

- `featuredOverride`
- normalized `tags`

Then add UI tests, or if the admin page currently has no client rendering test harness, add a focused smoke test around the helper behavior instead of trying to overbuild the harness in this phase.

- [ ] **Step 2: Add local admin UI state for curation controls**

Update `src/app/admin/page.tsx`:

- extend `Post` type with `featuredOverride`, `tags`, `likeCount`, and `viewCount`
- render tags under each post row
- add a featured override control with three actions:
  - `精选`
  - `取消精选`
  - `自动`
- add a lightweight tag editing control:
  - plain text input with comma-separated tags is acceptable in phase 1
  - submit to `PUT /api/admin/forum/posts/:id/tags`

- [ ] **Step 3: Wire the existing admin APIs**

Add handlers in `src/app/admin/page.tsx`:

- `handleFeaturedOverride(postId, featuredOverride)`
- `handleTagSave(postId, tags)`

Implementation direction:

```ts
await fetch(`/api/admin/forum/posts/${postId}/featured`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ featuredOverride }),
});
```

and

```ts
await fetch(`/api/admin/forum/posts/${postId}/tags`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    tags: parsedTags.map((label) => ({ label, kind: "freeform" })),
  }),
});
```

For phase 1, it is acceptable to preserve only freeform tag editing in the UI if adding mixed core/freeform editing makes the form too error-prone.

- [ ] **Step 4: Add copy for the curation controls**

Update:

- `src/i18n/en.ts`
- `src/i18n/zh.ts`

Suggested keys:

- `admin.forum.featured.auto`
- `admin.forum.featured.on`
- `admin.forum.featured.off`
- `admin.forum.tags.label`
- `admin.forum.tags.save`

- [ ] **Step 5: Run targeted tests**

Run: `node --import tsx --test src/app/api/admin/forum/posts/admin-posts.test.ts`
Expected: PASS

- [ ] **Step 6: Manually verify the admin flow**

Run the app and check:

1. Admin list shows tags and featured state.
2. Changing featured override persists after refresh.
3. Editing tags persists after refresh.
4. Hidden / restore actions still work.

Recommended commands:

```bash
npm test -- src/app/api/admin/forum/posts/admin-posts.test.ts
npm run dev
```

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/page.tsx src/app/api/admin/forum/posts/admin-posts.test.ts src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(admin): add forum featured and tag curation controls"
```

## Task 6: Final verification and rollout notes

**Files:**
- Modify: `docs/superpowers/plans/2026-03-18-forum-discovery-and-curation-phase-1.md`

- [ ] **Step 1: Run the forum-focused automated checks**

Run:

```bash
node --import tsx --test \
  src/lib/forum-list-query.test.ts \
  src/lib/forum-post-list-data.test.ts \
  src/lib/forum-feed.test.ts \
  src/app/api/forum/posts/forum-hidden-filter.test.ts \
  src/app/api/forum/forum-workflow.test.ts \
  src/app/forum-post-list-content.test.tsx \
  src/app/forum-post-page-state.test.tsx \
  src/app/api/admin/forum/posts/admin-posts.test.ts
```

Expected: PASS

- [ ] **Step 2: Run a quick manual regression sweep**

Check:

1. `/forum` default load still uses SSR initial data.
2. Changing category / sort / tags updates the URL and fetches the expected list.
3. Refreshing the page preserves the visible list state.
4. `/forum/[id]` still loads normally.
5. Admin hide / restore / featured / tags all succeed.

- [ ] **Step 3: Record follow-up backlog separately**

Create a follow-up spec or issue list for:

- public interaction UI
- view-count deduplication
- richer freeform tag discovery
- full-text search / indexing
- related-post recommendations

- [ ] **Step 4: Final commit**

```bash
git add docs/superpowers/plans/2026-03-18-forum-discovery-and-curation-phase-1.md
git commit -m "docs: finalize forum phase 1 implementation plan"
```

## Notes For The Next Plan

When phase 1 lands, the next best standalone plan should be `forum-engagement-phase-2` with:

- human-facing like / reply UI on detail pages
- optimistic updates using `src/lib/forum-client.ts`
- auth-aware interaction states
- rate-limit and error messaging UX

