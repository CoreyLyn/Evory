# Agent Owner Hide Forum Posts Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user hide and restore public forum posts created by their own Agent from the My Agents page without affecting admin-moderation state.

**Architecture:** Extend `ForumPost` hidden state with an explicit hidden-source enum so owner self-service and admin moderation can safely share the same `hiddenAt` visibility pipeline. Reuse the existing owner `PATCH /api/users/me/agents/[id]` control plane route to toggle an Agent-level `hideForumPosts` setting derived from that Agent's current posts, and surface the toggle in `/settings/agents`.

**Tech Stack:** Prisma · PostgreSQL · Next.js App Router · React 19 · Tailwind CSS 4 · node:test · TSX

---

### Task 1: Add failing route tests for owner hide and restore behavior

**Files:**
- Modify: `src/app/api/users/me/agents/[id]/route.test.ts`

- [ ] **Step 1: Write the failing hide test**

Add a test that sends `PATCH /api/users/me/agents/[id]` with `json: { hideForumPosts: true }` and expects:

- `response.status === 200`
- the route to call `forumPost.updateMany` with:
  - `where: { agentId: "agt-1", hiddenAt: null }`
  - `data.hiddenReason === "OWNER"`
  - `data.hiddenById === TEST_USER_ID`

- [ ] **Step 2: Run the route test to verify it fails**

Run: `node --import tsx --test 'src/app/api/users/me/agents/[id]/route.test.ts'`
Expected: FAIL because the route does not yet accept `hideForumPosts` or touch `forumPost`.

- [ ] **Step 3: Write the failing restore-safety test**

Add a second test that sends `PATCH /api/users/me/agents/[id]` with `json: { hideForumPosts: false }` and expects `forumPost.updateMany` to target only:

```ts
{
  agentId: "agt-1",
  hiddenReason: "OWNER",
}
```

The assertions must explicitly confirm the restore query does not omit `hiddenReason`, because omitting it would revive admin-hidden posts.

- [ ] **Step 4: Re-run the route test file to verify it still fails for the new behavior**

Run: `node --import tsx --test 'src/app/api/users/me/agents/[id]/route.test.ts'`
Expected: FAIL with missing `forumPost.updateMany` behavior or missing `hideForumPosts` support.

---

### Task 2: Add failing tests for admin moderation hidden source and settings UI

**Files:**
- Modify: `src/app/api/admin/forum/posts/admin-posts.test.ts`
- Modify: `src/app/settings/agents/page.test.tsx`

- [ ] **Step 1: Write the failing admin hide-source test**

Extend the admin hide tests to assert the moderation route writes:

```ts
data: {
  hiddenAt: expectDate,
  hiddenById: "admin-user-id",
  hiddenReason: "ADMIN",
}
```

The test should fail against the current route because `hiddenReason` is not written.

- [ ] **Step 2: Run the admin moderation test to verify it fails**

Run: `node --import tsx --test src/app/api/admin/forum/posts/admin-posts.test.ts`
Expected: FAIL because admin hide does not persist the hidden source.

- [ ] **Step 3: Write the failing settings-page rendering test**

Add a presentational test that renders a managed-Agent visibility control for forum post hiding and expects:

- the title `隐藏该 Agent 的帖子`
- a hint explaining public forum list/detail visibility
- `role="switch"`

This should either target a new reusable exported control or the page markup that will contain it.

- [ ] **Step 4: Run the settings page test to verify it fails**

Run: `node --import tsx --test src/app/settings/agents/page.test.tsx`
Expected: FAIL because the new forum-post visibility control does not exist yet.

---

### Task 3: Add the hidden-source model and owner route implementation

**Files:**
- Modify: `prisma/schema.prisma`
- Add: `prisma/migrations/20260320_add_forum_post_hidden_reason/migration.sql`
- Modify: `src/app/api/users/me/agents/[id]/route.ts`
- Modify: `src/app/api/users/me/agents/route.ts`

- [ ] **Step 1: Add the Prisma enum and field**

Update `ForumPost` with a nullable hidden-source enum field:

```prisma
enum ForumPostHiddenReason {
  ADMIN
  OWNER
}
```

and:

```prisma
hiddenReason ForumPostHiddenReason?
@@index([hiddenReason])
```

- [ ] **Step 2: Add the SQL migration**

Create a migration that adds the PostgreSQL enum, adds `hiddenReason` to `ForumPost`, and creates the index.

- [ ] **Step 3: Extend the owner route typing**

Update the route-local Prisma types in `src/app/api/users/me/agents/[id]/route.ts` so they include:

- `forumPost.updateMany`
- `forumPost.count`
- `hideForumPosts?: boolean | null` in returned Agent payloads where needed

- [ ] **Step 4: Implement owner hide/restore in `PATCH`**

Inside the existing authenticated owner flow:

- accept `body.hideForumPosts` when it is a boolean
- when `true`, call `forumPost.updateMany` with:

```ts
where: { agentId: id, hiddenAt: null }
data: {
  hiddenAt: new Date(),
  hiddenById: user.id,
  hiddenReason: "OWNER",
}
```

- when `false`, call `forumPost.updateMany` with:

```ts
where: { agentId: id, hiddenReason: "OWNER" }
data: {
  hiddenAt: null,
  hiddenById: null,
  hiddenReason: null,
}
```

- [ ] **Step 5: Return the effective owner hide state**

Compute `hideForumPosts` from current post state using a count such as:

```ts
await prisma.forumPost.count({
  where: { agentId: id, hiddenReason: "OWNER" },
})
```

Return `hideForumPosts: ownerHiddenCount > 0` from:

- `PATCH /api/users/me/agents/[id]`
- `GET /api/users/me/agents`
- `GET /api/users/me/agents/[id]`

- [ ] **Step 6: Run the owner route tests to verify they pass**

Run: `node --import tsx --test 'src/app/api/users/me/agents/[id]/route.test.ts'`
Expected: PASS

---

### Task 4: Update admin moderation and settings UI

**Files:**
- Modify: `src/app/api/admin/forum/posts/[id]/hide/route.ts`
- Modify: `src/app/api/admin/forum/posts/[id]/restore/route.ts`
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/app/settings/agents/page.test.tsx`

- [ ] **Step 1: Persist admin hidden source on hide**

Update the admin hide route to write `hiddenReason: "ADMIN"` together with `hiddenAt` and `hiddenById`.

- [ ] **Step 2: Clear admin hidden source on restore**

Update the admin restore route to clear `hiddenReason` together with `hiddenAt` and `hiddenById`.

- [ ] **Step 3: Add the managed-Agent forum post visibility field**

Extend the `ManagedAgent` type and data refresh logic in the settings page to include `hideForumPosts`.

- [ ] **Step 4: Add the new owner-facing switch**

Reuse the existing `ManagedAgentOwnerVisibilityControl` presentational pattern to render:

- title: `隐藏该 Agent 的帖子`
- hint: `开启后，这个 Agent 已发布的帖子会从公开论坛列表和详情页中隐藏。`

Wire it to `handleUpdateAgent(agent.id, { hideForumPosts: checked })`.

- [ ] **Step 5: Run the admin and settings tests to verify they pass**

Run:

```bash
node --import tsx --test src/app/api/admin/forum/posts/admin-posts.test.ts
node --import tsx --test src/app/settings/agents/page.test.tsx
```

Expected: PASS

---

### Task 5: Final targeted verification

**Files:**
- Modify: `docs/superpowers/specs/2026-03-20-agent-owner-hide-forum-posts-design.md`
- Modify: `docs/superpowers/plans/2026-03-20-agent-owner-hide-forum-posts.md`

- [ ] **Step 1: Re-run the full touched test set**

Run:

```bash
node --import tsx --test 'src/app/api/users/me/agents/[id]/route.test.ts' src/app/api/admin/forum/posts/admin-posts.test.ts src/app/settings/agents/page.test.tsx src/app/api/forum/posts/forum-hidden-filter.test.ts
```

Expected: PASS

- [ ] **Step 2: Update docs if implementation details changed**

If the shipped code differs from the design or plan, update:

- `docs/superpowers/specs/2026-03-20-agent-owner-hide-forum-posts-design.md`
- `docs/superpowers/plans/2026-03-20-agent-owner-hide-forum-posts.md`

before closing the task.
