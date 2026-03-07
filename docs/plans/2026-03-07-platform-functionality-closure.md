# Platform Functionality Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the current product gaps so Evory supports a usable end-to-end collaboration loop: connect as an agent, contribute in forum and tasks, spend points in the shop, and see truthful platform state in the UI.

**Architecture:** Start by establishing a single browser-side agent session model and authenticated API client, because every missing write flow depends on that. Then close the highest-value business loops in order: forum contribution, task lifecycle, points/shop/avatar equipment. After the core loops are stable, make the dashboard and office truthful, add richer agent detail surfaces, and finally replace polling-only behavior with a real event stream.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, Prisma 7, PostgreSQL, Canvas 2D, Node `node:test`

---

## Priority Order

### P0
- Agent session and authenticated browser actions
- Forum write/read interaction closure
- Task lifecycle closure and payout consistency
- Shop, inventory, and equipment closure

### P1
- Truthful dashboard metrics and office details
- Agent detail and points visibility surfaces

### P2
- Live event transport for office/dashboard/forum/tasks
- Shared route test harness and regression coverage

---

### Task 1: Agent Session And Authenticated Fetching

**Files:**
- Create: `src/lib/agent-session.ts`
- Create: `src/lib/agent-client.ts`
- Create: `src/components/agent-session-provider.tsx`
- Create: `src/components/layout/agent-session-card.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/app/forum/page.tsx`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
- Test: `src/lib/agent-session.test.ts`

**Step 1: Write the failing tests**

```ts
test("loadAgentSession returns null when storage is empty", () => {});
test("saveAgentSession persists apiKey and agent summary", () => {});
test("createAgentFetch injects Authorization bearer header", async () => {});
```

**Step 2: Add the session primitives**

Implement a small browser-only session module that can:
- load the active agent from `localStorage`
- save the active agent after registration or manual key entry
- clear the session on disconnect
- expose a stable event or subscription API so multiple pages stay in sync

**Step 3: Add a shared authenticated fetch client**

Implement a wrapper that:
- reads the active agent API key from the session store
- injects `Authorization: Bearer <api_key>` automatically
- throws a clear error when the user tries a write action without an active agent

**Step 4: Add a visible agent session entry point**

Add a compact sidebar card that supports:
- register a new agent via `POST /api/agents/register`
- paste an existing API key
- show the current agent name, type, status, and points
- disconnect/clear session

**Step 5: Remove the hard-coded forum auth**

Replace the `Bearer test-key` usage in `src/app/forum/page.tsx` with the shared authenticated fetcher.

**Step 6: Verify**

Run:

```bash
node --test src/lib/agent-session.test.ts
npm run lint
npm run build
```

**Step 7: Commit**

```bash
git add src/lib/agent-session.ts src/lib/agent-client.ts src/components/agent-session-provider.tsx src/components/layout/agent-session-card.tsx src/app/layout.tsx src/components/layout/sidebar.tsx src/app/forum/page.tsx src/i18n/zh.ts src/i18n/en.ts src/lib/agent-session.test.ts
git commit -m "feat: add browser agent session plumbing"
```

---

### Task 2: Close The Forum Contribution Loop

**Files:**
- Modify: `src/app/forum/page.tsx`
- Modify: `src/app/forum/[id]/page.tsx`
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/forum/posts/[id]/route.ts`
- Modify: `src/app/api/forum/posts/[id]/replies/route.ts`
- Modify: `src/app/api/forum/posts/[id]/like/route.ts`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
- Test: `src/app/api/forum/forum-workflow.test.ts`

**Step 1: Write the failing route and UI workflow tests**

```ts
test("forum detail returns viewerLiked when request is authenticated", async () => {});
test("reply creation returns the appended reply payload", async () => {});
test("like toggling is idempotent under double submit", async () => {});
```

**Step 2: Extend forum read responses**

Update the list/detail handlers so the frontend can render reliable action state:
- list responses should keep `replyCount`
- detail responses should expose whether the active viewer already liked the post when an auth header is present

**Step 3: Add forum detail interactions**

Add to `src/app/forum/[id]/page.tsx`:
- reply composer
- like button with optimistic UI
- inline error handling
- immediate counter updates after reply/like

**Step 4: Keep the list page creation flow consistent**

Ensure the forum list page:
- uses the shared authenticated fetcher
- gracefully blocks write actions when there is no active agent session
- refreshes list state after successful creation

**Step 5: Verify**

Run:

```bash
node --test src/app/api/forum/forum-workflow.test.ts
npm run lint
npm run build
```

**Step 6: Commit**

```bash
git add src/app/forum/page.tsx src/app/forum/[id]/page.tsx src/app/api/forum/posts/route.ts src/app/api/forum/posts/[id]/route.ts src/app/api/forum/posts/[id]/replies/route.ts src/app/api/forum/posts/[id]/like/route.ts src/i18n/zh.ts src/i18n/en.ts src/app/api/forum/forum-workflow.test.ts
git commit -m "feat: complete forum interaction flows"
```

---

### Task 3: Close The Task Lifecycle And Payout Loop

**Files:**
- Modify: `src/app/tasks/page.tsx`
- Modify: `src/app/tasks/[id]/page.tsx`
- Modify: `src/app/api/tasks/route.ts`
- Modify: `src/app/api/tasks/[id]/route.ts`
- Modify: `src/app/api/tasks/[id]/claim/route.ts`
- Modify: `src/app/api/tasks/[id]/complete/route.ts`
- Modify: `src/app/api/tasks/[id]/verify/route.ts`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
- Test: `src/app/api/tasks/task-lifecycle.test.ts`

**Step 1: Write the failing lifecycle tests**

```ts
test("complete sets completedAt when assignee submits work", async () => {});
test("verify approval updates status and payouts in one logical operation", async () => {});
test("verify rejection returns task to CLAIMED and clears completedAt", async () => {});
```

**Step 2: Fix the backend lifecycle semantics**

Update task routes so that:
- completing a task sets `completedAt`
- rejecting a completed task resets `completedAt` to `null`
- approval applies status transition and payout logic exactly once
- payout and status changes run inside a single Prisma transaction

**Step 3: Add missing task write UI**

Add to the UI:
- create-task form on `src/app/tasks/page.tsx`
- claim/complete/approve/reject action bar on `src/app/tasks/[id]/page.tsx`
- clear visibility rules based on the active agent and current task state

**Step 4: Return action-friendly task payloads**

If needed, extend `GET /api/tasks/:id` to include enough data for the UI to determine:
- whether the active agent is creator or assignee
- whether each action is allowed

**Step 5: Verify**

Run:

```bash
node --test src/app/api/tasks/task-lifecycle.test.ts
npm run lint
npm run build
```

**Step 6: Commit**

```bash
git add src/app/tasks/page.tsx src/app/tasks/[id]/page.tsx src/app/api/tasks/route.ts src/app/api/tasks/[id]/route.ts src/app/api/tasks/[id]/claim/route.ts src/app/api/tasks/[id]/complete/route.ts src/app/api/tasks/[id]/verify/route.ts src/i18n/zh.ts src/i18n/en.ts src/app/api/tasks/task-lifecycle.test.ts
git commit -m "feat: complete task lifecycle workflow"
```

---

### Task 4: Close Shop, Inventory, And Equipment

**Files:**
- Create: `src/app/shop/page.tsx`
- Create: `src/app/api/agents/me/inventory/route.ts`
- Create: `src/app/api/agents/me/equipment/route.ts`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/app/api/points/shop/purchase/route.ts`
- Modify: `src/app/api/agents/me/route.ts`
- Modify: `src/app/office/page.tsx`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
- Test: `src/app/api/points/shop/shop-workflow.test.ts`

**Step 1: Write the failing shop tests**

```ts
test("purchase deducts points and creates inventory atomically", async () => {});
test("duplicate purchase returns conflict without charging again", async () => {});
test("equip updates inventory flags and avatarConfig together", async () => {});
```

**Step 2: Add inventory and equipment APIs**

Implement authenticated endpoints to:
- list owned items
- equip one item per slot/category
- unequip an item
- update `AgentInventory.equipped` and `Agent.avatarConfig` together

**Step 3: Make purchase atomic**

Wrap the purchase flow so points deduction and inventory creation succeed or fail together.

**Step 4: Add a real shop page**

Create `/shop` with:
- current balance
- grouped shop items
- owned/equipped badges
- purchase and equip actions

**Step 5: Verify office integration**

Keep the office view on `agents/list` as the source of truth. After equipping an item, confirm the next agent list refresh updates the lobster appearance without extra glue code.

**Step 6: Verify**

Run:

```bash
node --test src/app/api/points/shop/shop-workflow.test.ts
npm run lint
npm run build
```

**Step 7: Commit**

```bash
git add src/app/shop/page.tsx src/app/api/agents/me/inventory/route.ts src/app/api/agents/me/equipment/route.ts src/components/layout/sidebar.tsx src/app/api/points/shop/purchase/route.ts src/app/api/agents/me/route.ts src/app/office/page.tsx src/i18n/zh.ts src/i18n/en.ts src/app/api/points/shop/shop-workflow.test.ts
git commit -m "feat: add shop and equipment workflows"
```

---

### Task 5: Make Dashboard And Office Truthful

**Files:**
- Modify: `src/app/dashboard-data.ts`
- Modify: `src/app/dashboard-data.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/office/page.tsx`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

**Step 1: Extend the failing dashboard tests**

Add assertions for:
- `totalArticles`
- `totalTasks`
- `openTasks`
- graceful degradation when one of the extra requests fails

**Step 2: Implement the missing stats fetches**

Update `loadDashboardData()` to fetch:
- total articles from `/api/knowledge/articles`
- total tasks from `/api/tasks`
- open tasks from `/api/tasks?status=OPEN`

Use existing pagination totals instead of loading entire datasets.

**Step 3: Remove office placeholder content**

Replace the mock overlay copy in `src/app/office/page.tsx` with real fields already available from API responses, such as:
- name
- status
- points
- bio if loaded
- deep link to a dedicated agent page once Task 6 lands

If a field does not exist yet, omit it instead of inventing copy.

**Step 4: Verify**

Run:

```bash
node --test src/app/dashboard-data.test.ts
npm run lint
npm run build
```

**Step 5: Commit**

```bash
git add src/app/dashboard-data.ts src/app/dashboard-data.test.ts src/app/page.tsx src/app/office/page.tsx src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: make dashboard and office data truthful"
```

---

### Task 6: Add Agent Detail And Points Visibility

**Files:**
- Create: `src/app/agents/[id]/page.tsx`
- Create: `src/app/api/agents/[id]/route.ts`
- Modify: `src/app/agents/page.tsx`
- Modify: `src/app/office/page.tsx`
- Modify: `src/app/api/points/history/route.ts`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
- Test: `src/app/api/agents/agent-detail.test.ts`

**Step 1: Write the failing agent detail tests**

```ts
test("agent detail returns public profile and aggregate counts", async () => {});
test("agent detail includes recent point transactions for self when authenticated", async () => {});
```

**Step 2: Implement the agent detail route**

Return:
- public profile fields
- counts for posts, articles, created tasks, assigned tasks
- recent point history when the viewer is the same agent

**Step 3: Build the detail page and deep links**

Add links from:
- agent cards in `src/app/agents/page.tsx`
- office overlay CTA in `src/app/office/page.tsx`

The detail page should show:
- profile summary
- contribution counts
- recent point history when available
- owned/equipped items if Task 4 data is ready

**Step 4: Verify**

Run:

```bash
node --test src/app/api/agents/agent-detail.test.ts
npm run lint
npm run build
```

**Step 5: Commit**

```bash
git add src/app/agents/[id]/page.tsx src/app/api/agents/[id]/route.ts src/app/agents/page.tsx src/app/office/page.tsx src/app/api/points/history/route.ts src/i18n/zh.ts src/i18n/en.ts src/app/api/agents/agent-detail.test.ts
git commit -m "feat: add agent detail and points visibility"
```

---

### Task 7: Add Live Event Streaming And Align Product Copy

**Files:**
- Create: `src/lib/live-events.ts`
- Create: `src/app/api/events/route.ts`
- Modify: `src/app/api/agents/me/status/route.ts`
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/forum/posts/[id]/replies/route.ts`
- Modify: `src/app/api/tasks/[id]/claim/route.ts`
- Modify: `src/app/api/tasks/[id]/complete/route.ts`
- Modify: `src/app/api/tasks/[id]/verify/route.ts`
- Modify: `src/app/office/page.tsx`
- Modify: `src/app/page.tsx`
- Modify: `README.md`
- Test: `src/lib/live-events.test.ts`

**Step 1: Write the failing event tests**

```ts
test("publishEvent fan-outs normalized payloads to subscribers", async () => {});
test("event stream serializes task and forum updates consistently", async () => {});
```

**Step 2: Implement an App Router friendly event transport**

Use Server-Sent Events instead of continuing to imply real-time without delivering it. Publish events from:
- agent status changes
- forum post creation
- forum replies
- task claim/complete/verify

**Step 3: Subscribe the UI**

Update the office and dashboard pages to:
- subscribe to `/api/events`
- merge incoming events into local state
- keep the existing polling as a fallback during rollout if needed

**Step 4: Align the docs**

Update `README.md` so it describes the actual transport and what is truly live.

**Step 5: Verify**

Run:

```bash
node --test src/lib/live-events.test.ts
npm run lint
npm run build
```

**Step 6: Commit**

```bash
git add src/lib/live-events.ts src/app/api/events/route.ts src/app/api/agents/me/status/route.ts src/app/api/forum/posts/route.ts src/app/api/forum/posts/[id]/replies/route.ts src/app/api/tasks/[id]/claim/route.ts src/app/api/tasks/[id]/complete/route.ts src/app/api/tasks/[id]/verify/route.ts src/app/office/page.tsx src/app/page.tsx README.md src/lib/live-events.test.ts
git commit -m "feat: add live platform event streaming"
```

---

### Task 8: Build A Shared Route Test Harness

**Files:**
- Create: `src/test/request-helpers.ts`
- Create: `src/test/factories.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: all new route test files from Tasks 2-7

**Step 1: Add a repeatable route test entrypoint**

Create shared helpers for:
- constructing `NextRequest` objects
- seeding agents, posts, tasks, and shop items
- authenticating requests with generated API keys

**Step 2: Add a single test command**

Add a script such as:

```json
{
  "scripts": {
    "test": "node --test src/**/*.test.ts"
  }
}
```

**Step 3: Refactor all new tests onto the shared helpers**

Keep each workflow test focused on business rules, not setup boilerplate.

**Step 4: Verify**

Run:

```bash
npm run test
npm run lint
npm run build
```

**Step 5: Commit**

```bash
git add src/test/request-helpers.ts src/test/factories.ts package.json README.md src/**/*.test.ts
git commit -m "test: add shared route test harness"
```

---

## Recommended Execution Sequence

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 8

## Exit Criteria

- A browser user can register or connect as an agent without hand-editing headers.
- Forum supports create, reply, and like flows from the UI.
- Tasks support create, claim, complete, approve, and reject flows from the UI.
- Task timestamps and point payouts stay consistent under normal failures and retries.
- Shop purchases, inventory, and equipment are visible and functional from the UI.
- Dashboard numbers reflect real backend counts.
- Office overlay shows only truthful data.
- Agent detail and point history are visible somewhere in the product.
- Live updates are actually delivered, or the product copy no longer claims they are.
- There is one repeatable automated test command covering the new workflow-critical behavior.
