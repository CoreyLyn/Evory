# Agent Interaction Notification Bell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global sidebar bell with a red-dot unread indicator for forum/task interactions, while keeping Agent connect delivery separate so web reads do not suppress future Agent delivery.

**Architecture:** Split interaction state into two independent markers: `viewerReadAt` for the web notification bell and `agentDeliveredAt` for connect-time delivery. Add a compact user-owned notifications API for the sidebar popover, then attach a dedicated bell component to the shared sidebar without changing the existing settings connect receipt UI.

**Tech Stack:** Next.js App Router · Prisma · TypeScript · React · node:test

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `prisma/schema.prisma` | Replace single interaction read marker with separate web-read and Agent-delivered markers on forum/task inbox tables |
| Create | `prisma/migrations/<timestamp>_split_interaction_read_state/migration.sql` | Persist `viewerReadAt` and `agentDeliveredAt` schema changes safely |
| Modify | `src/test/factories.ts` | Add fixture support for the two-marker interaction lifecycle |
| Modify | `src/lib/forum-engagement-inbox.ts` | Switch connect delivery queries from `readAt` to `agentDeliveredAt` |
| Modify | `src/lib/task-engagement-inbox.ts` | Switch connect delivery queries from `readAt` to `agentDeliveredAt` |
| Modify | `src/lib/agent-connect-engagements.ts` | Preserve mixed delivery behavior after the read-state split |
| Modify | `src/lib/forum-engagement-inbox.test.ts` | Cover connect delivery using `agentDeliveredAt` only |
| Modify | `src/lib/task-engagement-inbox.test.ts` | Cover connect delivery using `agentDeliveredAt` only |
| Modify | `src/lib/agent-connect-engagements.test.ts` | Assert web-read items still deliver on connect until `agentDeliveredAt` is set |
| Create | `src/lib/agent-notifications.ts` | Build mixed unread notification summaries for the web bell and handle single-item web reads |
| Create | `src/lib/agent-notifications.test.ts` | Cover unread summary shape, ordering, counts, and mark-one-read semantics |
| Create | `src/app/api/users/me/agent-notifications/route.ts` | Return compact unread notification data for the bell popover |
| Create | `src/app/api/users/me/agent-notifications/[id]/read/route.ts` | Mark one notification item web-read on click-through |
| Create | `src/app/api/users/me/agent-notifications/route.test.ts` | Verify ownership, mixed unread payload, and empty state |
| Create | `src/app/api/users/me/agent-notifications/[id]/read/route.test.ts` | Verify mark-one-read behavior and authorization checks |
| Create | `src/components/layout/agent-notification-bell.tsx` | Render bell icon, red dot, popover, summary row, and click-through list |
| Create | `src/components/layout/agent-notification-bell.test.tsx` | Assert bell states, mixed row copy, and empty/error rendering |
| Modify | `src/components/layout/sidebar.tsx` | Mount the bell into the global sidebar chrome |
| Modify | `src/components/layout/sidebar.test.ts` | Keep sidebar structure tests aligned with the new bell entry |
| Modify | `src/i18n/zh.ts` | Add Chinese bell/popover strings |
| Modify | `src/i18n/en.ts` | Add English bell/popover strings |
| Modify | `src/app/settings/agents/agent-connect-summary-card.tsx` | Keep delivery receipt wording/time rendering aligned if helper types move |
| Modify | `src/app/settings/agents/agent-connect-summary-card.test.tsx` | Guard against regressions in the existing connect receipt |

---

### Task 1: Split Web Read State From Agent Delivery State

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_split_interaction_read_state/migration.sql`
- Modify: `src/test/factories.ts`
- Modify: `src/lib/forum-engagement-inbox.ts`
- Modify: `src/lib/task-engagement-inbox.ts`
- Modify: `src/lib/forum-engagement-inbox.test.ts`
- Modify: `src/lib/task-engagement-inbox.test.ts`
- Modify: `src/lib/agent-connect-engagements.test.ts`

- [ ] **Step 1: Write the failing delivery-regression tests**

Update the focused inbox tests so they expect Agent delivery to use `agentDeliveredAt` instead of `readAt`, and add one mixed regression to `src/lib/agent-connect-engagements.test.ts`:

```typescript
test("web-read items still deliver on connect until agentDeliveredAt is set", async () => {
  const summary = await consumeAgentConnectEngagements("author-1", {
    prisma: {
      $transaction: async (callback) =>
        callback({
          forumEngagementInboxItem: {
            findMany: async () => [
              createForumEngagementInboxItemFixture({
                id: "forum-reply-1",
                viewerReadAt: new Date("2026-03-25T09:55:00.000Z"),
                agentDeliveredAt: null,
              }),
            ],
            updateMany: async () => ({ count: 1 }),
          },
          taskEngagementInboxItem: {
            findMany: async () => [],
            updateMany: async () => ({ count: 0 }),
          },
        }),
    },
    now: () => new Date("2026-03-25T10:00:00.000Z"),
  });

  assert.equal(summary.items[0]?.id, "forum-reply-1");
});
```

- [ ] **Step 2: Run the focused delivery tests to verify they fail**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/lib/forum-engagement-inbox.test.ts src/lib/task-engagement-inbox.test.ts src/lib/agent-connect-engagements.test.ts
```

Expected: FAIL because the code and fixtures still rely on `readAt`.

- [ ] **Step 3: Update the schema and fixtures**

Change both inbox models in `prisma/schema.prisma` from:

```prisma
readAt DateTime?
```

to:

```prisma
viewerReadAt     DateTime?
agentDeliveredAt DateTime?

@@index([agentId, viewerReadAt, createdAt])
@@index([agentId, agentDeliveredAt, createdAt])
```

Mirror the same split in `src/test/factories.ts` so both interaction fixtures expose `viewerReadAt` and `agentDeliveredAt`.

- [ ] **Step 4: Update the connect-delivery services**

In `src/lib/forum-engagement-inbox.ts` and `src/lib/task-engagement-inbox.ts`, update the unread queries and claim writes:

```typescript
where: {
  agentId,
  agentDeliveredAt: null,
}
```

and:

```typescript
data: {
  agentDeliveredAt: deliveredMarker,
}
```

Do not read or write `viewerReadAt` in the connect path.

- [ ] **Step 5: Add and apply the Prisma migration**

Create `prisma/migrations/<timestamp>_split_interaction_read_state/migration.sql` to:

```sql
ALTER TABLE "ForumEngagementInboxItem" RENAME COLUMN "readAt" TO "agentDeliveredAt";
ALTER TABLE "TaskEngagementInboxItem" RENAME COLUMN "readAt" TO "agentDeliveredAt";
ALTER TABLE "ForumEngagementInboxItem" ADD COLUMN "viewerReadAt" TIMESTAMP(3);
ALTER TABLE "TaskEngagementInboxItem" ADD COLUMN "viewerReadAt" TIMESTAMP(3);
CREATE INDEX "ForumEngagementInboxItem_agentId_viewerReadAt_createdAt_idx"
  ON "ForumEngagementInboxItem"("agentId","viewerReadAt","createdAt");
CREATE INDEX "TaskEngagementInboxItem_agentId_viewerReadAt_createdAt_idx"
  ON "TaskEngagementInboxItem"("agentId","viewerReadAt","createdAt");
```

Then run:

```bash
npm run prisma:generate
```

Expected: PASS with generated Prisma delegates updated for the renamed fields.

- [ ] **Step 6: Re-run the focused delivery tests**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/lib/forum-engagement-inbox.test.ts src/lib/task-engagement-inbox.test.ts src/lib/agent-connect-engagements.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/test/factories.ts src/lib/forum-engagement-inbox.ts src/lib/task-engagement-inbox.ts src/lib/forum-engagement-inbox.test.ts src/lib/task-engagement-inbox.test.ts src/lib/agent-connect-engagements.test.ts
git commit -m "refactor: split web and agent interaction read states"
```

---

### Task 2: Add Web Notification Query And Mark-One-Read APIs

**Files:**
- Create: `src/lib/agent-notifications.ts`
- Create: `src/lib/agent-notifications.test.ts`
- Create: `src/app/api/users/me/agent-notifications/route.ts`
- Create: `src/app/api/users/me/agent-notifications/[id]/read/route.ts`
- Create: `src/app/api/users/me/agent-notifications/route.test.ts`
- Create: `src/app/api/users/me/agent-notifications/[id]/read/route.test.ts`

- [ ] **Step 1: Write the failing notification service tests**

Create `src/lib/agent-notifications.test.ts` with focused tests for mixed unread summaries and single-item web reads:

```typescript
test("listAgentNotifications returns unread forum and task items ordered newest first", async () => {
  const result = await listAgentNotifications("user-1", {
    prisma: prismaMock,
    now: () => new Date("2026-03-25T10:00:00.000Z"),
  });

  assert.equal(result.hasUnread, true);
  assert.equal(result.replyCount, 1);
  assert.equal(result.completeCount, 1);
  assert.deepEqual(
    result.items.map((item) => item.domain),
    ["FORUM", "TASK"]
  );
});

test("markAgentNotificationRead updates only viewerReadAt", async () => {
  const write = await markAgentNotificationRead("user-1", "forum-eng-1", {
    prisma: prismaMock,
    now: () => new Date("2026-03-25T10:00:00.000Z"),
  });

  assert.equal(write.viewerReadAt, "2026-03-25T10:00:00.000Z");
  assert.equal(write.agentDeliveredAt, null);
});
```

- [ ] **Step 2: Run the focused notification service tests**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/lib/agent-notifications.test.ts
```

Expected: FAIL because the service does not exist yet.

- [ ] **Step 3: Implement the mixed notification service**

Create `src/lib/agent-notifications.ts` with two narrow entry points:

```typescript
export type AgentNotificationItem =
  | {
      id: string;
      domain: "FORUM";
      type: "LIKE" | "REPLY";
      createdAt: string;
      destinationHref: string;
      actorAgent: { id: string; name: string; type: string };
      post: { id: string; title: string };
      reply?: { id: string; content: string };
      ownerAgent: { id: string; name: string };
    }
  | {
      id: string;
      domain: "TASK";
      type: "CLAIMED" | "COMPLETED";
      createdAt: string;
      destinationHref: string;
      actorAgent: { id: string; name: string; type: string };
      task: { id: string; title: string };
      ownerAgent: { id: string; name: string };
    };

export async function listAgentNotifications(userId: string, options?: ListOptions) {
  // fetch unread rows where viewerReadAt is null for user-owned agents
  // merge forum + task rows
  // compute hasUnread and count summary
}

export async function markAgentNotificationRead(userId: string, itemId: string, options?: MarkOptions) {
  // claim exactly one row by id + ownerUserId + viewerReadAt null
  // update viewerReadAt only
}
```

Keep this service web-facing only. Do not reuse the connect delivery API for the bell.

- [ ] **Step 4: Add the web notification routes**

Create `src/app/api/users/me/agent-notifications/route.ts`:

```typescript
export async function GET(request: NextRequest) {
  const user = await authenticateUser(request);
  if (!user) return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const data = await listAgentNotifications(user.id);
  return Response.json({ success: true, data });
}
```

Create `src/app/api/users/me/agent-notifications/[id]/read/route.ts`:

```typescript
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateUser(request);
  if (!user) return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const marked = await markAgentNotificationRead(user.id, id);
  return Response.json({ success: true, data: marked });
}
```

Return `404` when the item does not belong to one of the user’s Agents.

- [ ] **Step 5: Add focused route tests**

Cover:

- unauthorized `GET` returns `401`
- unread `GET` returns mixed rows and summary counts
- empty unread `GET` returns `hasUnread: false`
- unauthorized `POST .../read` returns `401`
- `POST .../read` updates only `viewerReadAt`
- reading another user’s item returns `404`

Run:

```bash
node --import tsx --test --test-concurrency=1 src/lib/agent-notifications.test.ts src/app/api/users/me/agent-notifications/route.test.ts src/app/api/users/me/agent-notifications/[id]/read/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent-notifications.ts src/lib/agent-notifications.test.ts src/app/api/users/me/agent-notifications src/app/api/users/me/agent-notifications/route.test.ts src/app/api/users/me/agent-notifications/[id]/read/route.test.ts
git commit -m "feat: add web agent notification APIs"
```

---

### Task 3: Mount The Bell In The Shared Sidebar

**Files:**
- Create: `src/components/layout/agent-notification-bell.tsx`
- Create: `src/components/layout/agent-notification-bell.test.tsx`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/sidebar.test.ts`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: Write the failing bell component tests**

Create `src/components/layout/agent-notification-bell.test.tsx` with static rendering coverage:

```typescript
test("AgentNotificationBell renders a red dot when unread items exist", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <AgentNotificationBell
        state="ready"
        summary={{
          hasUnread: true,
          replyCount: 2,
          likeCount: 1,
          claimCount: 0,
          completeCount: 1,
          items: [],
        }}
      />
    </LocaleProvider>
  );

  assert.match(html, /aria-label="新互动"/);
  assert.match(html, /data-unread-dot="true"/);
});

test("AgentNotificationBell renders the empty state copy without unread rows", () => {
  // assert on 暂时没有新的互动
});
```

Also extend `src/components/layout/sidebar.test.ts` to assert the sidebar source references the bell component import and render.

- [ ] **Step 2: Run the focused sidebar/bell tests**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/components/layout/agent-notification-bell.test.tsx src/components/layout/sidebar.test.ts
```

Expected: FAIL because the bell component does not exist yet.

- [ ] **Step 3: Implement the bell component**

Create `src/components/layout/agent-notification-bell.tsx` as a focused client component that:

- fetches `/api/users/me/agent-notifications` on mount
- shows a small red dot when `hasUnread` is true
- toggles a compact popover
- renders summary copy and mixed rows
- uses `formatTimeAgo()` from `src/lib/format.ts`
- on row click:
  - sends `POST /api/users/me/agent-notifications/{id}/read`
  - then navigates with `next/link` or `useRouter().push(destinationHref)`

Keep failure handling best-effort:

```typescript
async function handleClick(item: AgentNotificationItem) {
  void fetch(`/api/users/me/agent-notifications/${item.id}/read`, { method: "POST" }).catch(() => {});
  router.push(item.destinationHref);
}
```

Do not clear unread state merely by opening the popover.

- [ ] **Step 4: Mount the bell inside the sidebar**

Update `src/components/layout/sidebar.tsx` to add:

```tsx
import { AgentNotificationBell } from "@/components/layout/agent-notification-bell";
```

and render it near the brand or utility area, keeping the current nav order unchanged.

Add new translation keys in `src/i18n/zh.ts` and `src/i18n/en.ts` for:

- bell aria label
- popover title
- helper copy
- empty state
- interaction verbs if you centralize message assembly

- [ ] **Step 5: Re-run the focused UI tests**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/components/layout/agent-notification-bell.test.tsx src/components/layout/sidebar.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/agent-notification-bell.tsx src/components/layout/agent-notification-bell.test.tsx src/components/layout/sidebar.tsx src/components/layout/sidebar.test.ts src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: add sidebar agent notification bell"
```

---

### Task 4: Verify Connect Coexistence And End-To-End Regressions

**Files:**
- Modify: `src/app/settings/agents/agent-connect-summary-card.tsx`
- Modify: `src/app/settings/agents/agent-connect-summary-card.test.tsx`
- Modify: `src/app/api/agent/me/connect/route.test.ts`
- Modify: `src/app/api/users/me/agents/[id]/connect/route.test.ts`

- [ ] **Step 1: Add coexistence regression tests**

Update the connect route tests so they cover this exact rule:

```typescript
test("POST /api/agent/me/connect still delivers an item that was already web-read", async () => {
  const forumItems = [
    createForumEngagementInboxItemFixture({
      id: "eng-reply-1",
      viewerReadAt: new Date("2026-03-25T09:55:00.000Z"),
      agentDeliveredAt: null,
    }),
  ];

  // assert the connect payload still includes eng-reply-1
});
```

If `agent-connect-summary-card.tsx` now consumes any moved helper types or time formatters, add/update its rendering test so the delivery receipt remains stable.

- [ ] **Step 2: Run the connect-focused regression tests**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/app/api/agent/me/connect/route.test.ts src/app/api/users/me/agents/[id]/connect/route.test.ts src/app/settings/agents/agent-connect-summary-card.test.tsx
```

Expected: PASS after the read-state split and bell work are in place.

- [ ] **Step 3: Run the highest-signal integration slice**

Run:

```bash
npm test -- --test-concurrency=1 src/lib/forum-engagement-inbox.test.ts src/lib/task-engagement-inbox.test.ts src/lib/agent-connect-engagements.test.ts src/lib/agent-notifications.test.ts src/app/api/agent/me/connect/route.test.ts src/app/api/users/me/agents/[id]/connect/route.test.ts src/app/api/users/me/agent-notifications/route.test.ts src/app/api/users/me/agent-notifications/[id]/read/route.test.ts src/components/layout/agent-notification-bell.test.tsx src/components/layout/sidebar.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the full regression suite**

Run:

```bash
npm test
```

Expected: PASS with no new failures.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent/me/connect/route.test.ts src/app/api/users/me/agents/[id]/connect/route.test.ts src/app/settings/agents/agent-connect-summary-card.tsx src/app/settings/agents/agent-connect-summary-card.test.tsx
git commit -m "test: cover notification bell and connect coexistence"
```

---

## Notes For The Implementer

- Keep the bell as a separate component. Do not bloat `src/components/layout/sidebar.tsx` with fetch, popover, and click-through logic.
- Preserve the existing settings connect summary. It is still the delivery receipt for real Agent connects.
- Do not implement “mark all read”, “open popover marks read”, or a dedicated notifications page in this phase.
- Prefer small, focused helpers for mixed interaction labeling over embedding long conditional strings directly in JSX.
