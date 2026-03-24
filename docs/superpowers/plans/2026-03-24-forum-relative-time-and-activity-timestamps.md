# Forum Relative Time And Activity Timestamps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make forum `X 分钟/小时/天前` timestamps semantically correct by showing publish time in the UI and using an explicit activity timestamp for active sorting.

**Architecture:** Stop using `ForumPost.updatedAt` as a user-facing forum timestamp. Introduce `lastActivityAt` on `ForumPost` for thread activity ordering, update it only when a new reply is created, and keep UI relative-time text anchored to `createdAt` unless a component explicitly labels itself as activity-based. Add targeted tests around timestamp serialization, sorting, reply updates, and `formatTimeAgo` boundaries.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, React 19, Node test runner with `tsx`

---

## Recommended Product Semantics

- Unlabeled forum post relative time in cards and post headers means `published at`, backed by `createdAt`.
- `Recently active` sort means reply-driven thread activity, backed by `lastActivityAt`.
- Reply rows continue to show each reply's own `createdAt`.
- `ForumPost.updatedAt` remains an internal record-mutation timestamp and must not drive forum display or forum sort semantics.
- Passive reads and counter maintenance such as `viewCount` and `likeCount` must not affect forum activity ranking.

## File Map

- Create: `prisma/migrations/<timestamp>_forum_post_last_activity_at/migration.sql`
- Create: `src/lib/format.test.ts`
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/forum-post-list-data.ts`
- Modify: `src/lib/forum-post-list-data.test.ts`
- Modify: `src/app/api/forum/posts/[id]/route.ts`
- Modify: `src/app/api/forum/posts/[id]/replies/route.ts`
- Modify: `src/app/forum/forum-page-client.tsx`
- Modify: `src/app/forum/[id]/forum-post-page-client.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`
- Modify: `src/app/forum-post-detail-content.test.tsx`
- Modify: any forum route tests that assert selected fields or sort behavior if they break after the contract change

### Task 1: Lock The Timestamp Contract In Tests

**Files:**
- Create: `src/lib/format.test.ts`
- Modify: `src/lib/forum-post-list-data.test.ts`
- Modify: `src/app/forum-post-list-content.test.tsx`
- Modify: `src/app/forum-post-detail-content.test.tsx`

- [ ] **Step 1: Write failing tests for `formatTimeAgo` thresholds and future input**

Add coverage for:
- `< 60s` returns `justNow`
- `60m` returns `1h`
- `7d` returns `1w`
- future timestamps do not produce negative units or broken output

Suggested cases:

```ts
test("formatTimeAgo clamps future dates to just now", () => {
  const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  assert.equal(formatTimeAgo(future, "zh"), "刚刚");
});
```

- [ ] **Step 2: Write failing tests for forum list payload semantics**

Update `src/lib/forum-post-list-data.test.ts` to assert:
- list payload serializes `createdAt`
- list payload serializes `lastActivityAt`
- `sort: "active"` orders by `lastActivityAt`, not `updatedAt`

Expected assertion shape:

```ts
assert.deepEqual(capturedOrderBy, [{ lastActivityAt: "desc" }, { createdAt: "desc" }]);
```

- [ ] **Step 3: Write failing rendering tests for forum cards and post header**

Change the forum rendering tests to distinguish post publish time from update time by passing different values:
- `createdAt: "2026-03-10T00:00:00.000Z"`
- `updatedAt: "2026-03-12T00:00:00.000Z"`

Render with:

```tsx
formatTimeAgo={(value) => `formatted:${value}`}
```

Assert that the post card and main post header render `formatted:2026-03-10T00:00:00.000Z`, while reply rows still use each reply's own `createdAt`.

- [ ] **Step 4: Run targeted tests and confirm they fail for the expected reasons**

Run:

```bash
npm test -- src/lib/format.test.ts src/lib/forum-post-list-data.test.ts src/app/forum-post-list-content.test.tsx src/app/forum-post-detail-content.test.tsx
```

Expected:
- `formatTimeAgo` tests fail because there is no dedicated test file yet or behavior is incomplete
- forum list tests fail because `lastActivityAt` is absent and active sort still uses `updatedAt`
- forum render tests fail because UI still displays `updatedAt ?? createdAt`

- [ ] **Step 5: Commit the red tests**

```bash
git add src/lib/format.test.ts src/lib/forum-post-list-data.test.ts src/app/forum-post-list-content.test.tsx src/app/forum-post-detail-content.test.tsx
git commit -m "test: lock forum timestamp semantics"
```

### Task 2: Add Explicit Thread Activity Timestamp

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_forum_post_last_activity_at/migration.sql`
- Modify: `src/lib/forum-post-list-data.ts`
- Modify: forum detail/list response types if they are declared separately from these files
- Test: `src/lib/forum-post-list-data.test.ts`

- [ ] **Step 1: Add `lastActivityAt` to `ForumPost` schema**

Add a non-null column and index:

```prisma
lastActivityAt DateTime @default(now())

@@index([lastActivityAt])
```

Place it near `createdAt` and `updatedAt` so timestamp semantics stay obvious.

- [ ] **Step 2: Write the migration with a deterministic backfill**

Backfill existing rows so `lastActivityAt` becomes:
- latest reply `createdAt` when replies exist
- otherwise `createdAt`

Do not backfill from `updatedAt`, because current `updatedAt` is polluted by views and likes.

- [ ] **Step 3: Expose `lastActivityAt` in list payloads**

Update `ForumListPost` and serialization in `src/lib/forum-post-list-data.ts`:

```ts
lastActivityAt: string;
```

and:

```ts
lastActivityAt: serializeDate(lastActivityAt),
```

- [ ] **Step 4: Switch active sorting to `lastActivityAt`**

Replace:

```ts
[{ updatedAt: "desc" }, { createdAt: "desc" }]
```

with:

```ts
[{ lastActivityAt: "desc" }, { createdAt: "desc" }]
```

Also update any `top` tie-breakers that currently rely on `updatedAt`.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
npm test -- src/lib/forum-post-list-data.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit the schema and payload changes**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/forum-post-list-data.ts src/lib/forum-post-list-data.test.ts
git commit -m "feat: add explicit forum thread activity timestamp"
```

### Task 3: Update Write Paths To Maintain Activity Correctly

**Files:**
- Modify: `src/app/api/forum/posts/[id]/replies/route.ts`
- Modify: post-create route if it needs explicit `lastActivityAt` initialization beyond schema default
- Modify: any reply route tests covering side effects

- [ ] **Step 1: Add a failing test for reply-driven thread activity**

If there is already a route test file for replies, extend it; otherwise create one near the route.

Assert that reply creation:
- creates the reply
- updates the parent post's `lastActivityAt`

Expected mocked write:

```ts
await tx.forumPost.update({
  where: { id: postId },
  data: { lastActivityAt: replyTimestamp },
});
```

- [ ] **Step 2: Update reply creation to mutate the parent thread activity**

Wrap reply creation and post activity update in a single transaction so the two writes stay consistent.

Recommended shape:

```ts
const reply = await prisma.$transaction(async (tx) => {
  const createdReply = await tx.forumReply.create(...);
  await tx.forumPost.update({
    where: { id: postId },
    data: { lastActivityAt: createdReply.createdAt },
  });
  return createdReply;
});
```

- [ ] **Step 3: Leave likes and views alone unless they accidentally touch `lastActivityAt`**

No extra `lastActivityAt` updates should be added to:
- `src/app/api/forum/posts/[id]/like/route.ts`
- `src/lib/forum-post-views.ts`

Those writes may still bump Prisma `updatedAt`, but that no longer affects forum display or forum active ordering.

- [ ] **Step 4: Run reply route tests**

Run:

```bash
npm test -- src/app/api/forum/posts/[id]/replies
```

If no dedicated file exists, run the exact test file you add.

- [ ] **Step 5: Commit the activity-write fix**

```bash
git add src/app/api/forum/posts/[id]/replies/route.ts src/app/api/forum/posts/[id]/*.test.ts
git commit -m "fix: track forum activity from replies"
```

### Task 4: Switch Forum UI To Publish Time

**Files:**
- Modify: `src/app/forum/forum-page-client.tsx`
- Modify: `src/app/forum/[id]/forum-post-page-client.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`
- Modify: `src/app/forum-post-detail-content.test.tsx`

- [ ] **Step 1: Change forum list cards to render `createdAt`**

Replace:

```tsx
formatTimeAgo(post.updatedAt ?? post.createdAt)
```

with:

```tsx
formatTimeAgo(post.createdAt)
```

- [ ] **Step 2: Change forum detail main post and discovery cards to render `createdAt`**

Apply the same rule to:
- main post hero metadata
- related posts cards
- more-from-author cards

Do not change reply rows; they already use reply `createdAt`.

- [ ] **Step 3: Keep `lastActivityAt` out of unlabeled UI for now**

Unless product wants explicit activity chips such as `Last reply 2h ago`, do not surface `lastActivityAt` in the current metadata row. A bare relative-time string is more safely interpreted as publish time.

- [ ] **Step 4: Run forum rendering tests**

Run:

```bash
npm test -- src/app/forum-post-list-content.test.tsx src/app/forum-post-detail-content.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit the UI semantics change**

```bash
git add src/app/forum/forum-page-client.tsx src/app/forum/[id]/forum-post-page-client.tsx src/app/forum-post-list-content.test.tsx src/app/forum-post-detail-content.test.tsx
git commit -m "fix: show forum publish time in relative timestamps"
```

### Task 5: Finish The `formatTimeAgo` Guard Rails

**Files:**
- Modify: `src/lib/format.ts`
- Modify: `src/lib/format.test.ts`

- [ ] **Step 1: Clamp invalid and future diffs before unit conversion**

Recommended guard:

```ts
if (!Number.isFinite(diffMs) || diffMs <= 0) return s.justNow;
```

This prevents future timestamps from leaking into negative unit math and keeps the function safe for bad inputs.

- [ ] **Step 2: Keep threshold behavior stable**

Do not change existing thresholds unless product explicitly wants calendar-aware months/years. Preserve:
- `< 60s` => just now
- `< 60m` => minutes
- `< 24h` => hours
- `< 7d` => days
- `< 30d` => weeks
- `< 365d` => months

- [ ] **Step 3: Run the dedicated helper tests**

Run:

```bash
npm test -- src/lib/format.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit the helper hardening**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "test: harden relative time formatting boundaries"
```

### Task 6: Full Verification

**Files:**
- Verify changed files only

- [ ] **Step 1: Run the full focused test set**

Run:

```bash
npm test -- src/lib/format.test.ts src/lib/forum-post-list-data.test.ts src/app/forum-post-list-content.test.tsx src/app/forum-post-detail-content.test.tsx
```

- [ ] **Step 2: Run forum API tests touched by the activity change**

Run the reply route test file and any forum detail route tests that validate selected fields or view-count behavior.

- [ ] **Step 3: Run lint on changed files if the repo lint setup supports file targeting**

Run:

```bash
npx eslint src/lib/format.ts src/lib/format.test.ts src/lib/forum-post-list-data.ts src/lib/forum-post-list-data.test.ts src/app/forum/forum-page-client.tsx src/app/forum/[id]/forum-post-page-client.tsx src/app/forum-post-list-content.test.tsx src/app/forum-post-detail-content.test.tsx
```

- [ ] **Step 4: Manual verification in the forum UI**

Check:
- a post with older `createdAt` and newer `updatedAt` still shows the older publish time
- viewing a post increments `viewCount` without changing visible relative time
- adding a reply moves the thread upward in `Recently active`
- `Latest` ordering still tracks publish time

- [ ] **Step 5: Final commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/format.ts src/lib/format.test.ts src/lib/forum-post-list-data.ts src/lib/forum-post-list-data.test.ts src/app/api/forum/posts/[id]/replies/route.ts src/app/forum/forum-page-client.tsx src/app/forum/[id]/forum-post-page-client.tsx src/app/forum-post-list-content.test.tsx src/app/forum-post-detail-content.test.tsx
git commit -m "fix: separate forum publish time from activity time"
```

## Notes And Tradeoffs

- This plan intentionally does not try to keep Prisma `updatedAt` stable during counter updates. That is unnecessary once forum semantics stop depending on it.
- If product later wants visible activity timestamps, add a labeled secondary field such as `Last reply 2h ago` instead of overloading the single unlabeled relative-time slot.
- If there is resistance to a schema migration, a fallback is to compute `lastActivityAt` from replies at read time, but that will complicate Prisma sorting and increase query complexity. The explicit column is the cleaner long-term design.
