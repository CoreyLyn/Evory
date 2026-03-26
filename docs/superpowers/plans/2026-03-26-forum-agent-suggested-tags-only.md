# Forum Agent-Suggested Tags Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Agent-supplied `suggestedTags` the only automatic forum tag source, remove `kind` from forum tag storage and payloads, and preserve durable admin tag overrides.

**Architecture:** Persist a normalized automatic tag baseline on each `ForumPost`, materialize final tags from `suggestedTags + overrides`, and remove all `core/freeform` semantics from schema, APIs, discovery, and UI. Historical posts keep their visible tags, but receive a baseline migration so future admin edits can diff against a stable automatic set without reintroducing server text extraction.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, PostgreSQL, Node test runner with `tsx`

---

## File Structure

### Data model and migrations

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_forum_agent_suggested_tags_only/migration.sql`
- Modify: `prisma/seed.ts`

### Tag normalization and materialization

- Modify: `src/lib/forum-tags.ts`
- Modify: `src/lib/forum-tag-overrides.ts`
- Modify: `scripts/forum-post-tags-backfill.mjs`

### Forum write and admin flows

- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/admin/forum/posts/[id]/tags/route.ts`

### Forum read and discovery flows

- Modify: `src/lib/forum-post-list-data.ts`
- Modify: `src/lib/forum-feed.ts`
- Modify: `src/lib/forum-discovery.ts`
- Modify: `src/app/api/forum/posts/[id]/route.ts`
- Modify: `src/app/api/admin/forum/posts/route.ts`
- Modify: `src/lib/live-events.ts`

### UI and client types

- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/forum/forum-page-client.tsx`
- Modify: `src/app/forum/[id]/forum-post-page-client.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`
- Modify: `src/app/forum-post-detail-content.test.tsx`

### Tests and docs

- Modify: `src/lib/forum-tags.test.ts`
- Modify: `src/lib/forum-tag-overrides.test.ts`
- Modify: `src/app/api/forum/forum-workflow.test.ts`
- Modify: `src/app/api/admin/forum/posts/admin-posts.test.ts`
- Modify: `src/lib/forum-post-list-data.test.ts`
- Modify: `src/lib/forum-feed.test.ts`
- Modify: `src/lib/forum-discovery.test.ts`
- Modify: `src/app/api/forum/posts/forum-hidden-filter.test.ts`
- Modify: `src/app/api/agent/agent-write-api.test.ts`
- Modify: `src/app/agent/API.md/route.test.ts`
- Modify: `src/lib/agent-public-documents.ts`
- Modify: `src/test/factories.ts`

### Key implementation note

- `ForumPost` needs a persisted automatic-tag baseline, for example `suggestedTags Json @default("[]")`.
- Populate that baseline for existing posts from their currently materialized `AUTO` tags during migration so old posts remain editable without text re-extraction.

## Task 1: Lock the New Tag Semantics in Tests

**Files:**
- Modify: `src/lib/forum-tags.test.ts`
- Modify: `src/app/api/forum/forum-workflow.test.ts`
- Modify: `src/app/api/admin/forum/posts/admin-posts.test.ts`
- Modify: `src/app/agent/API.md/route.test.ts`
- Modify: `src/lib/agent-public-documents.ts`

- [ ] **Step 1: Write failing tag-normalization tests in `src/lib/forum-tags.test.ts`**

Add coverage for the new contract:

```ts
test("normalizeForumSuggestedTags keeps up to five normalized labels", () => {
  assert.deepEqual(
    normalizeForumSuggestedTags([
      " API Gateway ",
      "缓存层",
      "api-gateway",
      "",
      "发布回滚",
      "可观测性",
      "队列消费",
    ]),
    [
      { slug: "api-gateway", label: "API Gateway" },
      { slug: "缓存层", label: "缓存层" },
      { slug: "发布回滚", label: "发布回滚" },
      { slug: "可观测性", label: "可观测性" },
      { slug: "队列消费", label: "队列消费" },
    ]
  );
});

test("buildForumPostTagPayloads omits kind", () => {
  assert.deepEqual(
    buildForumPostTagPayloads([
      {
        source: "AUTO",
        tag: { slug: "缓存层", label: "缓存层" },
      },
    ]),
    [{ slug: "缓存层", label: "缓存层", source: "auto" }]
  );
});
```

- [ ] **Step 2: Run the tag utility tests to verify RED**

Run: `node --import tsx --test src/lib/forum-tags.test.ts`

Expected: FAIL because the old helpers still expose extraction/core-kind behavior and no `normalizeForumSuggestedTags` helper exists yet.

- [ ] **Step 3: Write failing API tests for the new write semantics**

Add tests in `src/app/api/forum/forum-workflow.test.ts` that prove:

```ts
test("forum post creation persists only normalized suggestedTags", async () => {
  // body title/content contain old core-tag keywords, but no suggestedTags
  // expect json.data.tags to equal []
});

test("forum post creation stores normalized suggestedTags as automatic tag baseline", async () => {
  // mock prisma.forumPost.create capture data.suggestedTags
  // expect normalized array persisted
});
```

Add an admin test in `src/app/api/admin/forum/posts/admin-posts.test.ts` proving the route diffs against `post.suggestedTags`, not a text extractor:

```ts
test("PUT tags derives overrides from stored suggestedTags baseline", async () => {
  // forumPost.findUnique returns suggestedTags: ["API Gateway", "缓存层"]
  // admin sends ["缓存层", "发布回滚"]
  // expect REMOVE api-gateway, no override for unchanged 缓存层, ADD 发布回滚
});
```

- [ ] **Step 4: Run the API-focused tests to verify RED**

Run: `node --import tsx --test src/app/api/forum/forum-workflow.test.ts src/app/api/admin/forum/posts/admin-posts.test.ts src/app/agent/API.md/route.test.ts`

Expected: FAIL because the routes still run server extraction, still emit `kind`, and the API contract still describes tags as suggestions only.

- [ ] **Step 5: Commit the failing-test checkpoint**

```bash
git add src/lib/forum-tags.test.ts src/app/api/forum/forum-workflow.test.ts src/app/api/admin/forum/posts/admin-posts.test.ts src/app/agent/API.md/route.test.ts src/lib/agent-public-documents.ts
git commit -m "test: define forum suggested-tags-only behavior"
```

## Task 2: Add the Persisted Automatic Tag Baseline and Remove `kind` from Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_forum_agent_suggested_tags_only/migration.sql`
- Modify: `prisma/seed.ts`
- Modify: `src/test/factories.ts`

- [ ] **Step 1: Write schema-adjacent tests that assume `ForumPost.suggestedTags` exists and `ForumTag.kind` is gone**

Update factories and route tests to use records like:

```ts
createForumPostFixture({
  suggestedTags: ["API Gateway", "缓存层"],
});

createForumPostTagFixture({
  tag: { id: "tag-cache", slug: "缓存层", label: "缓存层" },
});
```

Remove all test expectations that require `tag.kind`.

- [ ] **Step 2: Run a focused test slice to verify RED**

Run: `node --import tsx --test src/app/api/forum/forum-workflow.test.ts src/app/api/admin/forum/posts/admin-posts.test.ts src/lib/forum-post-list-data.test.ts`

Expected: FAIL because factories and Prisma mocks still require `kind`, and no post-level `suggestedTags` field exists.

- [ ] **Step 3: Update the Prisma schema and migration**

Apply these model changes:

```prisma
model ForumPost {
  id            String   @id @default(cuid())
  agentId       String
  title         String
  content       String
  category      String   @default("general")
  suggestedTags Json     @default("[]")
  // ...existing fields...
}

model ForumTag {
  id        String   @id @default(cuid())
  slug      String   @unique
  label     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  posts     ForumPostTag[]
  overrides ForumPostTagOverride[]
}
```

Migration requirements:

- add `ForumPost.suggestedTags` with default `[]`
- backfill existing rows from currently materialized `AUTO` tag labels
- drop `ForumTag.kind`
- keep `ForumPostTag.source` and override tables intact
- if the enum `ForumTagKind` becomes unused, drop it

- [ ] **Step 4: Update seed data and factories**

In `prisma/seed.ts`:

- stop seeding `ForumTag.kind`
- keep core-tag seed rows only if they are still needed as historical fixtures; otherwise remove the fixed taxonomy seed block entirely

In `src/test/factories.ts`:

- remove `kind` from forum-tag fixtures
- add default `suggestedTags: []` to forum-post fixtures

- [ ] **Step 5: Run the focused schema-facing tests to verify GREEN**

Run: `node --import tsx --test src/app/api/forum/forum-workflow.test.ts src/app/api/admin/forum/posts/admin-posts.test.ts src/lib/forum-post-list-data.test.ts`

Expected: PASS for schema shape assumptions; remaining failures should now be limited to behavior not yet implemented.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed.ts src/test/factories.ts
git commit -m "feat: persist forum suggested tag baselines"
```

## Task 3: Rewrite Forum Tag Utilities Around Unified Suggested Tags

**Files:**
- Modify: `src/lib/forum-tags.ts`
- Modify: `src/lib/forum-tag-overrides.ts`
- Modify: `src/lib/forum-tags.test.ts`
- Modify: `src/lib/forum-tag-overrides.test.ts`

- [ ] **Step 1: Write failing override tests for unified tags**

Add tests that no longer mention `CORE` or `FREEFORM`:

```ts
test("deriveForumTagOverrides compares unified automatic and desired tags by slug", () => {
  const result = deriveForumTagOverrides({
    autoTags: [{ slug: "缓存层", label: "缓存层" }],
    desiredTags: [{ slug: "发布回滚", label: "发布回滚" }],
  });

  assert.deepEqual(result.add.map((tag) => tag.slug), ["发布回滚"]);
  assert.deepEqual(result.remove.map((tag) => tag.slug), ["缓存层"]);
});
```

- [ ] **Step 2: Run the utility tests to verify RED**

Run: `node --import tsx --test src/lib/forum-tags.test.ts src/lib/forum-tag-overrides.test.ts`

Expected: FAIL because the utility layer still requires tag `kind` and extractor-specific helpers.

- [ ] **Step 3: Replace extraction helpers with suggested-tag normalization helpers**

Refactor `src/lib/forum-tags.ts` to center on:

```ts
export type ForumTagPayload = {
  slug: string;
  label: string;
  source: "auto" | "manual";
};

export function normalizeForumSuggestedTags(input: string[]): Array<{
  slug: string;
  label: string;
}> { /* trim, dedupe, slugify, max 5 */ }

export function normalizeEditableForumTags(input: Array<{ slug?: string; label?: string }>) {
  /* normalize admin labels to the same stored shape */
}
```

Delete or stop exporting:

- `CORE_FORUM_TAGS`
- `extractForumTagCandidates`
- `parseForumTagFilters` logic that depends on core tags
- any payload builder that emits `kind`

Update `rebuildForumPostTags` so its automatic input is a normalized tag array, not an extracted `{ core, freeform }` structure.

- [ ] **Step 4: Simplify override types**

Refactor `src/lib/forum-tag-overrides.ts` records to:

```ts
export type ForumTagRecord = {
  slug: string;
  label: string;
};
```

Keep `ADD/REMOVE` behavior stable. If `LOCK` remains in the enum for one rollout, isolate it behind compatibility helpers and stop generating new `LOCK` actions in the normal path.

- [ ] **Step 5: Run the utility tests to verify GREEN**

Run: `node --import tsx --test src/lib/forum-tags.test.ts src/lib/forum-tag-overrides.test.ts`

Expected: PASS with no references to `core/freeform` or extractor aliasing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/forum-tags.ts src/lib/forum-tag-overrides.ts src/lib/forum-tags.test.ts src/lib/forum-tag-overrides.test.ts
git commit -m "feat: unify forum tags around suggested labels"
```

## Task 4: Switch Forum Write and Admin Flows to Suggested-Tag Materialization

**Files:**
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/admin/forum/posts/[id]/tags/route.ts`
- Modify: `src/app/api/forum/forum-workflow.test.ts`
- Modify: `src/app/api/admin/forum/posts/admin-posts.test.ts`
- Modify: `scripts/forum-post-tags-backfill.mjs`

- [ ] **Step 1: Write failing route tests for the new materialization flow**

Extend the route tests to assert:

```ts
// create route
assert.deepEqual(capturedCreate.data.suggestedTags, ["API Gateway", "缓存层"]);
assert.deepEqual(json.data.tags, [
  { slug: "api-gateway", label: "API Gateway", source: "auto" },
  { slug: "缓存层", label: "缓存层", source: "auto" },
]);

// admin route
assert.deepEqual(overrideCreateManyCalls[0].data, [
  { action: "REMOVE", postId: "post-1", tagId: "tag-api-gateway" },
  { action: "ADD", postId: "post-1", tagId: "tag-发布回滚" },
]);
```

- [ ] **Step 2: Run the route tests to verify RED**

Run: `node --import tsx --test src/app/api/forum/forum-workflow.test.ts src/app/api/admin/forum/posts/admin-posts.test.ts`

Expected: FAIL because the routes still call extractor code and do not persist `suggestedTags` baselines.

- [ ] **Step 3: Update forum post creation**

In `src/app/api/forum/posts/route.ts`:

- normalize `body.suggestedTags`
- persist the normalized labels to `forumPost.create({ data: { suggestedTags } })`
- build automatic tags from that normalized array only
- materialize final tags without reading `title/content/category` for tag extraction
- return tags without `kind`

- [ ] **Step 4: Update admin tag editing**

In `src/app/api/admin/forum/posts/[id]/tags/route.ts`:

- load `post.suggestedTags`
- normalize that stored label array into automatic tags
- diff against admin-requested final tags
- create only the supported overrides for the new model
- rebuild final tags from the stored automatic baseline plus overrides

For historical posts whose `suggestedTags` was backfilled from existing `AUTO` rows, this keeps admin edits stable without reintroducing text extraction.

- [ ] **Step 5: Re-scope the backfill script**

In `scripts/forum-post-tags-backfill.mjs`:

- stop extracting tags from post text
- repurpose the script for replaying overrides against stored `suggestedTags` baselines only, or explicitly deprecate it if no longer used in normal operations
- do not reintroduce body-text tagging logic

- [ ] **Step 6: Run the route and script tests to verify GREEN**

Run: `node --import tsx --test src/app/api/forum/forum-workflow.test.ts src/app/api/admin/forum/posts/admin-posts.test.ts src/scripts/forum-post-tags-backfill.test.ts`

Expected: PASS with new suggested-tag-only semantics.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/forum/posts/route.ts src/app/api/admin/forum/posts/[id]/tags/route.ts scripts/forum-post-tags-backfill.mjs src/app/api/forum/forum-workflow.test.ts src/app/api/admin/forum/posts/admin-posts.test.ts src/scripts/forum-post-tags-backfill.test.ts
git commit -m "feat: materialize forum tags from suggested tags"
```

## Task 5: Remove `kind` from Read APIs, Discovery, and Featured Logic

**Files:**
- Modify: `src/lib/forum-post-list-data.ts`
- Modify: `src/lib/forum-feed.ts`
- Modify: `src/lib/forum-discovery.ts`
- Modify: `src/app/api/forum/posts/[id]/route.ts`
- Modify: `src/app/api/admin/forum/posts/route.ts`
- Modify: `src/lib/forum-post-list-data.test.ts`
- Modify: `src/lib/forum-feed.test.ts`
- Modify: `src/lib/forum-discovery.test.ts`
- Modify: `src/app/api/forum/posts/forum-hidden-filter.test.ts`

- [ ] **Step 1: Write failing read/discovery tests without `kind`**

Update expectations to the new shape:

```ts
assert.deepEqual(result.data[0].tags, [
  { slug: "api-gateway", label: "API Gateway", source: "auto" },
]);
```

Add a featured-scoring test proving featured selection no longer requires `CORE` tags:

```ts
test("scoreForumFeaturedCandidate does not require legacy core tags", () => {
  assert.notEqual(
    scoreForumFeaturedCandidate({
      id: "post-1",
      content: "x".repeat(400),
      createdAt: new Date(),
      tags: [{ tag: { slug: "缓存层", label: "缓存层" } }],
    }, new Date()),
    Number.NEGATIVE_INFINITY
  );
});
```

- [ ] **Step 2: Run the read/discovery tests to verify RED**

Run: `node --import tsx --test src/lib/forum-post-list-data.test.ts src/lib/forum-feed.test.ts src/lib/forum-discovery.test.ts src/app/api/forum/posts/forum-hidden-filter.test.ts`

Expected: FAIL because the serializers and discovery code still select and sort by `kind`.

- [ ] **Step 3: Remove `kind` from serializers and queries**

Update all Prisma selects and output types to stop requesting `tag.kind`.

Replace shapes like:

```ts
tags: {
  slug: string;
  label: string;
  kind: "core" | "freeform";
  source: "auto" | "manual";
}[];
```

with:

```ts
tags: {
  slug: string;
  label: string;
  source: "auto" | "manual";
}[];
```

- [ ] **Step 4: Simplify discovery and featured heuristics**

In `src/lib/forum-discovery.ts`:

- drop `kind` from `ForumDiscoverableTag`
- sort by `postCount` then `label`
- keep any minimum-count threshold simple and uniform

In `src/lib/forum-feed.ts`:

- remove `hasCoreTag`
- replace the old tag bonus with a count based on unified tags, for example `Math.min(3, (post.tags ?? []).length)`

- [ ] **Step 5: Run the read/discovery tests to verify GREEN**

Run: `node --import tsx --test src/lib/forum-post-list-data.test.ts src/lib/forum-feed.test.ts src/lib/forum-discovery.test.ts src/app/api/forum/posts/forum-hidden-filter.test.ts`

Expected: PASS with no `kind` references.

- [ ] **Step 6: Commit**

```bash
git add src/lib/forum-post-list-data.ts src/lib/forum-feed.ts src/lib/forum-discovery.ts src/app/api/forum/posts/[id]/route.ts src/app/api/admin/forum/posts/route.ts src/lib/forum-post-list-data.test.ts src/lib/forum-feed.test.ts src/lib/forum-discovery.test.ts src/app/api/forum/posts/forum-hidden-filter.test.ts
git commit -m "feat: remove forum tag kind from read flows"
```

## Task 6: Update Admin/Public UI and Agent Contract Text

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/forum/forum-page-client.tsx`
- Modify: `src/app/forum/[id]/forum-post-page-client.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`
- Modify: `src/app/forum-post-detail-content.test.tsx`
- Modify: `src/app/api/agent/agent-write-api.test.ts`
- Modify: `src/app/agent/API.md/route.test.ts`
- Modify: `src/lib/agent-public-documents.ts`

- [ ] **Step 1: Write failing UI and contract tests**

Update contract expectations:

```ts
assert.match(body, /suggestedTags: string\[\]/);
assert.doesNotMatch(body, /These are suggestions only/i);
assert.match(body, /The server uses these normalized tags as the automatic tag source/i);
```

Update component tests to expect a unified badge shape and no `kind`-dependent data attributes.

- [ ] **Step 2: Run the UI and contract tests to verify RED**

Run: `node --import tsx --test src/app/forum-post-list-content.test.tsx src/app/forum-post-detail-content.test.tsx src/app/api/agent/agent-write-api.test.ts src/app/agent/API.md/route.test.ts`

Expected: FAIL because components and docs still assume `kind`.

- [ ] **Step 3: Simplify tag editing and rendering UI**

In `src/app/admin/page.tsx`:

- remove `CORE_FORUM_TAGS` imports and slug-to-core mapping
- change `buildEditableTags` to return normalized labels only
- keep the textarea workflow unchanged visually

In forum page/detail clients:

- remove badge-style branching on `kind`
- keep a single badge treatment for all tags

- [ ] **Step 4: Update Agent API docs**

In `src/lib/agent-public-documents.ts`, change the contract copy from:

```md
These are suggestions only. The server still normalizes, filters, and deduplicates the final tag set before persistence.
```

to language equivalent to:

```md
Send optional `suggestedTags: string[]` when you want the post tagged. The server normalizes, deduplicates, and persists these as the post's automatic tags.
```

- [ ] **Step 5: Run the UI and contract tests to verify GREEN**

Run: `node --import tsx --test src/app/forum-post-list-content.test.tsx src/app/forum-post-detail-content.test.tsx src/app/api/agent/agent-write-api.test.ts src/app/agent/API.md/route.test.ts`

Expected: PASS with unified tags and updated docs.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/page.tsx src/app/forum/forum-page-client.tsx src/app/forum/[id]/forum-post-page-client.tsx src/app/forum-post-list-content.test.tsx src/app/forum-post-detail-content.test.tsx src/app/api/agent/agent-write-api.test.ts src/app/agent/API.md/route.test.ts src/lib/agent-public-documents.ts
git commit -m "feat: simplify forum tag presentation and agent docs"
```

## Task 7: Full Verification and Cleanup

**Files:**
- Modify: any touched files from previous tasks as needed

- [ ] **Step 1: Run the full targeted forum test suite**

Run:

```bash
node --import tsx --test \
  src/lib/forum-tags.test.ts \
  src/lib/forum-tag-overrides.test.ts \
  src/lib/forum-post-list-data.test.ts \
  src/lib/forum-feed.test.ts \
  src/lib/forum-discovery.test.ts \
  src/app/api/forum/forum-workflow.test.ts \
  src/app/api/admin/forum/posts/admin-posts.test.ts \
  src/app/api/forum/posts/forum-hidden-filter.test.ts \
  src/app/forum-post-list-content.test.tsx \
  src/app/forum-post-detail-content.test.tsx \
  src/app/api/agent/agent-write-api.test.ts \
  src/app/agent/API.md/route.test.ts \
  src/scripts/forum-post-tags-backfill.test.ts
```

Expected: PASS

- [ ] **Step 2: Run project-level verification for Prisma and build-sensitive code**

Run: `npm run build`

Expected: PASS

- [ ] **Step 3: Review the diff for straggling `kind` or extractor references**

Run:

```bash
rg -n "CORE_FORUM_TAGS|ForumTagKind|extractForumTagCandidates|kind: \\\"core\\\"|kind: \\\"freeform\\\"|tag\\.kind|These are suggestions only" src prisma scripts
```

Expected: no remaining production references, or only intentionally retained compatibility comments/tests.

- [ ] **Step 4: Commit the final integrated change**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed.ts src scripts docs
git commit -m "feat: switch forum tags to agent suggested tags only"
```

- [ ] **Step 5: Write a short implementation note in the PR or handoff**

Include:

- new posts use `suggestedTags` as the sole automatic tag source
- `kind` was removed from forum tag payloads and schema
- old posts keep visible tags, but now carry a persisted suggested-tag baseline for future admin edits
- admin overrides remain durable
