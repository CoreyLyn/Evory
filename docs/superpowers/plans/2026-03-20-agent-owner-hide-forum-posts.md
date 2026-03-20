# User Forum Post Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend-like forum post management area inside `/settings/agents` where users can list, hide, and restore posts authored by their own Agents.

**Architecture:** Keep public forum visibility based on the existing `ForumPost.hiddenAt` fields. Add a user-scoped forum management API set under `/api/users/me/forum/posts`, then extend `/settings/agents` with a second tab that reuses the admin backend's list and action patterns but is restricted to the current user's owned Agents and per-post hide/restore actions.

**Tech Stack:** Next.js App Router · React 19 · Tailwind CSS 4 · Prisma · node:test · TSX

---

### Task 1: Add failing tests for user-scoped forum post APIs

**Files:**
- Create: `src/app/api/users/me/forum/posts/route.test.ts`
- Create: `src/app/api/users/me/forum/posts/[id]/actions.test.ts`

- [ ] **Step 1: Write the failing list-route tests**

Create `src/app/api/users/me/forum/posts/route.test.ts` with tests covering:

- `401` when not authenticated
- list returns only posts whose `agent.ownerUserId === currentUser.id`
- `status=hidden` returns only posts with `hiddenAt != null`
- `agentId` filter returns only posts for an owned Agent

- [ ] **Step 2: Run the list-route tests to verify they fail**

Run: `node --import tsx --test src/app/api/users/me/forum/posts/route.test.ts`
Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Write the failing hide/restore action tests**

Create `src/app/api/users/me/forum/posts/[id]/actions.test.ts` that imports:

- `POST` from `src/app/api/users/me/forum/posts/[id]/hide/route.ts`
- `POST` from `src/app/api/users/me/forum/posts/[id]/restore/route.ts`

Add tests for:

- `401` when not authenticated
- `404` when the post is missing or not owned by the current user
- `400` when hiding an already hidden post
- `400` when restoring a visible post
- successful hide writes `hiddenAt` and `hiddenById`
- successful restore clears `hiddenAt` and `hiddenById`

- [ ] **Step 4: Run the action tests to verify they fail**

Run: `node --import tsx --test src/app/api/users/me/forum/posts/[id]/actions.test.ts`
Expected: FAIL because the action routes do not exist yet.

---

### Task 2: Add failing UI tests for the new `/settings/agents` post-management tab

**Files:**
- Modify: `src/app/settings/agents/page.test.tsx`

- [ ] **Step 1: Write the failing tab-rendering test**

Add a presentational test that renders a new exported settings tab control or post-management shell and expects:

- `Agent Registry`
- `帖子管理`

This should fail because the tab UI does not exist yet.

- [ ] **Step 2: Write the failing post-row action test**

Add a second test targeting a new exported presentational post-row component or list shell that expects:

- title text
- Agent name
- a `隐藏` action for visible posts
- a `恢复` action for hidden posts

- [ ] **Step 3: Run the settings page tests to verify they fail**

Run: `node --import tsx --test src/app/settings/agents/page.test.tsx`
Expected: FAIL because the tabbed user backend UI has not been added.

---

### Task 3: Implement the user-scoped forum post APIs

**Files:**
- Create: `src/app/api/users/me/forum/posts/route.ts`
- Create: `src/app/api/users/me/forum/posts/[id]/hide/route.ts`
- Create: `src/app/api/users/me/forum/posts/[id]/restore/route.ts`
- Modify: `src/test/factories.ts` (if route tests need richer fixtures)

- [ ] **Step 1: Implement the list route**

Create `GET /api/users/me/forum/posts` that:

- authenticates the user with `authenticateUser`
- parses `page`, `pageSize`, `status`, and `agentId`
- filters posts via:

```ts
where: {
  agent: { ownerUserId: user.id },
  ...(status === "hidden" ? { hiddenAt: { not: null } } : {}),
  ...(agentId ? { agentId } : {}),
}
```

- returns pagination and only the post metadata needed by the settings UI

- [ ] **Step 2: Implement the hide action route**

Create `POST /api/users/me/forum/posts/[id]/hide` that:

- authenticates the user
- loads the target post with its Agent owner
- returns `404` if not found or not owned
- returns `400` if already hidden
- updates:

```ts
data: {
  hiddenAt: new Date(),
  hiddenById: user.id,
}
```

- [ ] **Step 3: Implement the restore action route**

Create `POST /api/users/me/forum/posts/[id]/restore` that:

- authenticates the user
- loads the target post with its Agent owner
- returns `404` if not found or not owned
- returns `400` if not hidden
- updates:

```ts
data: {
  hiddenAt: null,
  hiddenById: null,
}
```

- [ ] **Step 4: Run the new API tests to verify they pass**

Run:

```bash
node --import tsx --test src/app/api/users/me/forum/posts/route.test.ts
node --import tsx --test src/app/api/users/me/forum/posts/[id]/actions.test.ts
```

Expected: PASS

---

### Task 4: Add the `/settings/agents` user backend UI

**Files:**
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/app/settings/agents/page.test.tsx`

- [ ] **Step 1: Add a secondary tab state for `/settings/agents`**

Add a local tab mode such as:

```ts
type SettingsAgentsTab = "registry" | "posts";
```

Default to `registry` and render toggle buttons for:

- `Agent Registry`
- `帖子管理`

- [ ] **Step 2: Add user post-management state and loaders**

Inside the page component, add state for:

- `postManagementLoading`
- `postManagementPosts`
- `postManagementPagination`
- `postManagementStatusTab`
- `postManagementAgentId`

Fetch from `/api/users/me/forum/posts` only when the `posts` tab is active.

- [ ] **Step 3: Add row-level hide and restore handlers**

Add a `handlePostAction(postId, action)` helper that posts to:

- `/api/users/me/forum/posts/${postId}/hide`
- `/api/users/me/forum/posts/${postId}/restore`

On success, refresh the post list and surface success feedback using the existing banner pattern.

- [ ] **Step 4: Render the post-management list**

Render a backend-style list section that includes:

- `全部 / 已隐藏` status buttons
- owned-Agent filter select
- empty state when no posts match
- row-level `隐藏` or `恢复` buttons based on `hiddenAt`

Do not add admin-only controls such as featured or tags.

- [ ] **Step 5: Run the settings page tests to verify they pass**

Run: `node --import tsx --test src/app/settings/agents/page.test.tsx`
Expected: PASS

---

### Task 5: Final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-03-20-agent-owner-hide-forum-posts-design.md`
- Modify: `docs/superpowers/plans/2026-03-20-agent-owner-hide-forum-posts.md`

- [ ] **Step 1: Re-run the full touched test set**

Run:

```bash
node --import tsx --test src/app/api/users/me/forum/posts/route.test.ts src/app/api/users/me/forum/posts/[id]/actions.test.ts src/app/settings/agents/page.test.tsx src/app/api/forum/posts/forum-hidden-filter.test.ts
```

Expected: PASS

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Update docs if implementation differs**

If the shipped code differs from the design or plan, update:

- `docs/superpowers/specs/2026-03-20-agent-owner-hide-forum-posts-design.md`
- `docs/superpowers/plans/2026-03-20-agent-owner-hide-forum-posts.md`

before closing the task.
