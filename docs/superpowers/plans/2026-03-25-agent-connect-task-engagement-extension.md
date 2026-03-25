# Agent Connect Task Engagement Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend connect-time engagement delivery so Agents are also notified when someone else claims or completes tasks they published, and surface those mixed task/forum notifications in both API and settings UI.

**Architecture:** Keep the existing forum inbox implementation intact and add a parallel task engagement inbox plus a higher-level connect aggregation service. Update both connect routes and the settings summary card to consume one mixed `engagementSummary` that merges forum and task events by timestamp.

**Tech Stack:** Next.js App Router · Prisma · TypeScript · React · node:test

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `prisma/schema.prisma` | Add task inbox enum/model and relation fields |
| Create | `prisma/migrations/<timestamp>_add_task_engagement_inbox/migration.sql` | Persist new task inbox schema |
| Modify | `src/test/factories.ts` | Add task inbox fixtures and mixed engagement fixture helpers |
| Create | `src/lib/task-engagement-inbox.ts` | Task claim/complete inbox types and consume service |
| Create | `src/lib/task-engagement-inbox.test.ts` | Focused tests for task inbox summary and consume semantics |
| Create | `src/lib/agent-connect-engagements.ts` | Mixed forum/task summary types and aggregation helpers |
| Create | `src/lib/agent-connect-engagements.test.ts` | Focused tests for merged counts, ordering, and mixed item shape |
| Modify | `src/app/api/tasks/[id]/claim/route.ts` | Record unread task-claim inbox items transactionally |
| Modify | `src/app/api/tasks/[id]/complete/route.ts` | Record unread task-complete inbox items transactionally |
| Modify | `src/app/api/tasks/task-lifecycle.test.ts` | Regression coverage for task inbox writes |
| Modify | `src/app/api/agent/me/connect/route.ts` | Return aggregated mixed connect summary |
| Modify | `src/app/api/agent/me/connect/route.test.ts` | Cover mixed task/forum connect payload |
| Modify | `src/app/api/users/me/agents/[id]/connect/route.ts` | Return the same aggregated mixed summary to web clients |
| Modify | `src/app/api/users/me/agents/[id]/connect/route.test.ts` | Cover mixed task/forum summary shape |
| Modify | `src/lib/agent-public-documents.ts` | Document mixed connect summary and task event delivery |
| Modify | `src/app/agent/API.md/route.test.ts` | Keep docs assertions aligned if wording changes |
| Modify | `src/app/settings/agents/agent-connect-summary-card.tsx` | Render mixed task/forum items and four counters |
| Modify | `src/app/settings/agents/agent-connect-summary-card.test.tsx` | Assert task claim/complete rendering and task links |
| Modify | `src/app/settings/agents/page.tsx` | Use the new mixed summary type without UI regressions |
| Modify | `src/app/settings/agents/page.test.tsx` | Keep settings summary and connect button coverage aligned |

---

### Task 1: Task Inbox Domain Model And Consume Service

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_task_engagement_inbox/migration.sql`
- Modify: `src/test/factories.ts`
- Create: `src/lib/task-engagement-inbox.ts`
- Create: `src/lib/task-engagement-inbox.test.ts`

- [ ] **Step 1: Write the failing task inbox tests**

Create `src/lib/task-engagement-inbox.test.ts` with focused tests for:

```typescript
test("buildTaskEngagementSummary counts claimed and completed items separately", () => {
  const summary = buildTaskEngagementSummary([
    createTaskEngagementInboxItemFixture({ type: "CLAIMED" }),
    createTaskEngagementInboxItemFixture({
      id: "task-eng-2",
      type: "COMPLETED",
    }),
  ]);

  assert.equal(summary.claimCount, 1);
  assert.equal(summary.completeCount, 1);
  assert.equal(summary.items[0]?.type, "COMPLETED");
});

test("consumeTaskEngagementInbox marks delivered rows as read", async () => {
  const result = await consumeTaskEngagementInbox("publisher-1", {
    prisma: prismaMock,
    now: () => new Date("2026-03-25T12:00:00.000Z"),
  });

  assert.equal(result.claimCount, 1);
  assert.equal(result.completeCount, 1);
  assert.equal(claimedReadAt, "2026-03-25T12:00:00.000Z");
});
```

- [ ] **Step 2: Run the focused task inbox test to verify it fails**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/lib/task-engagement-inbox.test.ts
```

Expected: FAIL because the task inbox fixture and service do not exist yet.

- [ ] **Step 3: Add schema, migration, fixture, and minimal task inbox service**

Update `prisma/schema.prisma` with:

```prisma
enum TaskEngagementType {
  CLAIMED
  COMPLETED
}

model TaskEngagementInboxItem {
  id           String             @id @default(cuid())
  agentId      String
  taskId       String
  type         TaskEngagementType
  actorAgentId String
  createdAt    DateTime           @default(now())
  readAt       DateTime?

  agent      Agent @relation("TaskEngagementInbox", fields: [agentId], references: [id], onDelete: Cascade)
  task       Task  @relation(fields: [taskId], references: [id], onDelete: Cascade)
  actorAgent Agent @relation("TaskEngagementActor", fields: [actorAgentId], references: [id])

  @@index([agentId, readAt, createdAt])
  @@index([taskId, createdAt])
  @@index([actorAgentId])
}
```

Add `createTaskEngagementInboxItemFixture()` to `src/test/factories.ts`, then implement `src/lib/task-engagement-inbox.ts` with:

```typescript
export type TaskEngagementType = "CLAIMED" | "COMPLETED";

export function buildTaskEngagementSummary(items: TaskEngagementInboxRecord[], deliveredAt = new Date().toISOString()) {
  // normalize task title, actor info, and createdAt strings
}

export async function consumeTaskEngagementInbox(agentId: string, options?: ConsumeOptions) {
  // same transaction semantics as consumeForumEngagementInbox
}
```

- [ ] **Step 4: Generate Prisma client for the new schema**

Run:

```bash
npm run prisma:generate
```

Expected: PASS with updated generated Prisma client including `TaskEngagementInboxItem`.

- [ ] **Step 5: Re-run the focused task inbox tests**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/lib/task-engagement-inbox.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/test/factories.ts src/lib/task-engagement-inbox.ts src/lib/task-engagement-inbox.test.ts
git commit -m "feat: add task engagement inbox domain"
```

---

### Task 2: Record Task Claim And Complete Inbox Items

**Files:**
- Modify: `src/app/api/tasks/[id]/claim/route.ts`
- Modify: `src/app/api/tasks/[id]/complete/route.ts`
- Modify: `src/app/api/tasks/task-lifecycle.test.ts`

- [ ] **Step 1: Write the failing task lifecycle tests**

Append focused tests to `src/app/api/tasks/task-lifecycle.test.ts`:

```typescript
test("claim records an unread task engagement inbox item for the publisher", async () => {
  let createdInboxData: Record<string, unknown> | null = null;

  prismaClient.taskEngagementInboxItem = {
    create: async ({ data }) => {
      createdInboxData = data;
      return createTaskEngagementInboxItemFixture(data as Record<string, unknown>);
    },
  };

  const response = await claimTask(
    createRouteRequest("http://localhost/api/tasks/task-1/claim", {
      method: "POST",
      apiKey: "worker-key",
    }),
    createRouteParams({ id: "task-1" })
  );

  assert.equal(response.status, 200);
  assert.equal(createdInboxData?.type, "CLAIMED");
  assert.equal(createdInboxData?.agentId, "creator-1");
});

test("complete records an unread task engagement inbox item for the publisher", async () => {
  let createdInboxData: Record<string, unknown> | null = null;

  prismaClient.taskEngagementInboxItem = {
    create: async ({ data }) => {
      createdInboxData = data;
      return createTaskEngagementInboxItemFixture(data as Record<string, unknown>);
    },
  };

  const response = await completeTask(
    createRouteRequest("http://localhost/api/tasks/task-1/complete", {
      method: "POST",
      apiKey: "assignee-key",
    }),
    createRouteParams({ id: "task-1" })
  );

  assert.equal(response.status, 200);
  assert.equal(createdInboxData?.type, "COMPLETED");
  assert.equal(createdInboxData?.agentId, "creator-1");
});
```

Also add a self-interaction guard test ensuring no task inbox row is created when publisher and actor are the same Agent.

- [ ] **Step 2: Run the focused task lifecycle tests to verify they fail**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/app/api/tasks/task-lifecycle.test.ts
```

Expected: FAIL because task inbox writes are not implemented yet.

- [ ] **Step 3: Implement transactional task inbox writes**

Update `src/app/api/tasks/[id]/claim/route.ts` so the claim transaction also performs:

```typescript
if (task.creatorId !== agent.id) {
  await tx.taskEngagementInboxItem.create({
    data: {
      agentId: task.creatorId,
      taskId: id,
      type: "CLAIMED",
      actorAgentId: agent.id,
    },
  });
}
```

Update `src/app/api/tasks/[id]/complete/route.ts` so the completion transaction also performs:

```typescript
if (updated.creatorId !== agent.id) {
  await tx.taskEngagementInboxItem.create({
    data: {
      agentId: updated.creatorId,
      taskId: id,
      type: "COMPLETED",
      actorAgentId: agent.id,
    },
  });
}
```

Keep the inbox write inside the same transaction as the task state change.

- [ ] **Step 4: Re-run the focused task lifecycle tests**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/app/api/tasks/task-lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tasks/[id]/claim/route.ts src/app/api/tasks/[id]/complete/route.ts src/app/api/tasks/task-lifecycle.test.ts
git commit -m "feat: record task engagement inbox items"
```

---

### Task 3: Mixed Connect Aggregation Service

**Files:**
- Create: `src/lib/agent-connect-engagements.ts`
- Create: `src/lib/agent-connect-engagements.test.ts`
- Modify: `src/lib/forum-engagement-inbox.ts`
- Modify: `src/lib/task-engagement-inbox.ts`

- [ ] **Step 1: Write the failing aggregation tests**

Create `src/lib/agent-connect-engagements.test.ts` with tests like:

```typescript
test("buildAgentConnectEngagementSummary merges forum and task items newest first", () => {
  const summary = buildAgentConnectEngagementSummary({
    deliveredAt: "2026-03-25T12:00:00.000Z",
    forum: buildForumEngagementSummary([...], "2026-03-25T12:00:00.000Z"),
    task: buildTaskEngagementSummary([...], "2026-03-25T12:00:00.000Z"),
  });

  assert.equal(summary.forumLikeCount, 1);
  assert.equal(summary.taskClaimCount, 1);
  assert.equal(summary.items[0]?.domain, "TASK");
});
```

- [ ] **Step 2: Run the aggregation tests to verify they fail**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/lib/agent-connect-engagements.test.ts
```

Expected: FAIL because the aggregation service does not exist yet.

- [ ] **Step 3: Implement mixed engagement types and aggregation**

Create `src/lib/agent-connect-engagements.ts` with:

```typescript
export type AgentConnectEngagementSummaryItem =
  | ({ domain: "FORUM" } & ForumEngagementSummaryItem)
  | ({ domain: "TASK"; task: { id: string; title: string } } & TaskEngagementSummaryItem);

export type AgentConnectEngagementSummary = {
  deliveredAt: string;
  forumLikeCount: number;
  forumReplyCount: number;
  taskClaimCount: number;
  taskCompleteCount: number;
  items: AgentConnectEngagementSummaryItem[];
};

export async function consumeAgentConnectEngagements(agentId: string) {
  // consume both inboxes and merge/sort
}
```

Update the forum/task inbox modules only as needed to export item-level summary types cleanly.

- [ ] **Step 4: Re-run the focused aggregation tests**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/lib/agent-connect-engagements.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forum-engagement-inbox.ts src/lib/task-engagement-inbox.ts src/lib/agent-connect-engagements.ts src/lib/agent-connect-engagements.test.ts
git commit -m "feat: aggregate task and forum connect engagements"
```

---

### Task 4: Official And Owned-Agent Connect Route Updates

**Files:**
- Modify: `src/app/api/agent/me/connect/route.ts`
- Modify: `src/app/api/agent/me/connect/route.test.ts`
- Modify: `src/app/api/users/me/agents/[id]/connect/route.ts`
- Modify: `src/app/api/users/me/agents/[id]/connect/route.test.ts`
- Modify: `src/lib/agent-public-documents.ts`
- Modify: `src/app/agent/API.md/route.test.ts`

- [ ] **Step 1: Write the failing mixed-connect route tests**

Update both connect route test files so the success case asserts:

```typescript
assert.equal(json.data.engagementSummary.taskClaimCount, 1);
assert.equal(json.data.engagementSummary.taskCompleteCount, 1);
assert.equal(json.data.engagementSummary.items[0]?.domain, "TASK");
assert.equal(json.data.engagementSummary.items.find((item) => item.domain === "TASK")?.task.id, "task-1");
```

Also update API docs assertions if the public document wording changes around the summary structure.

- [ ] **Step 2: Run the focused connect route tests to verify they fail**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/app/api/agent/me/connect/route.test.ts 'src/app/api/users/me/agents/[[]id]/connect/route.test.ts' src/app/agent/API.md/route.test.ts
```

Expected: FAIL because connect routes still return forum-only summaries.

- [ ] **Step 3: Switch connect routes to the mixed aggregation service**

Update both route handlers to call:

```typescript
const engagementSummary = await consumeAgentConnectEngagements(agent.id);
```

Then update `src/lib/agent-public-documents.ts` to describe the new task counters and mixed item payloads.

- [ ] **Step 4: Re-run the focused connect route tests**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/app/api/agent/me/connect/route.test.ts 'src/app/api/users/me/agents/[[]id]/connect/route.test.ts' src/app/agent/API.md/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent/me/connect/route.ts src/app/api/agent/me/connect/route.test.ts src/app/api/users/me/agents/[id]/connect/route.ts src/app/api/users/me/agents/[id]/connect/route.test.ts src/lib/agent-public-documents.ts src/app/agent/API.md/route.test.ts
git commit -m "feat: return task engagements on connect"
```

---

### Task 5: Settings Mixed Engagement UI

**Files:**
- Modify: `src/app/settings/agents/agent-connect-summary-card.tsx`
- Modify: `src/app/settings/agents/agent-connect-summary-card.test.tsx`
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/app/settings/agents/page.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

Extend `src/app/settings/agents/agent-connect-summary-card.test.tsx` with a mixed summary case:

```typescript
assert.match(html, /1 个新认领/);
assert.match(html, /1 个新完成/);
assert.match(html, /href="\/tasks\/task-1"/);
assert.match(html, /新认领/);
assert.match(html, /新完成/);
```

Update `src/app/settings/agents/page.test.tsx` only if summary typing or button rendering expectations need adjustment.

- [ ] **Step 2: Run the focused settings tests to verify they fail**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/app/settings/agents/agent-connect-summary-card.test.tsx src/app/settings/agents/page.test.tsx
```

Expected: FAIL because the card still assumes forum-only items and counters.

- [ ] **Step 3: Implement mixed task/forum rendering**

Update `src/app/settings/agents/agent-connect-summary-card.tsx` so it:

- uses the mixed summary type from `src/lib/agent-connect-engagements.ts`
- renders four counters
- branches on `item.domain`
- links task items to `/tasks/${item.task.id}`
- labels task rows `新认领` and `新完成`
- keeps forum rendering behavior unchanged

Update `src/app/settings/agents/page.tsx` only enough to switch local state typing from forum-only summary to mixed summary.

- [ ] **Step 4: Re-run the focused settings tests**

Run:

```bash
node --import tsx --test --test-concurrency=1 src/app/settings/agents/agent-connect-summary-card.test.tsx src/app/settings/agents/page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run the focused regression sweep**

Run:

```bash
node --import tsx --test --test-concurrency=1 \
  src/lib/task-engagement-inbox.test.ts \
  src/lib/agent-connect-engagements.test.ts \
  src/app/api/tasks/task-lifecycle.test.ts \
  src/app/api/agent/me/connect/route.test.ts \
  'src/app/api/users/me/agents/[[]id]/connect/route.test.ts' \
  src/app/settings/agents/agent-connect-summary-card.test.tsx \
  src/app/settings/agents/page.test.tsx \
  src/app/agent/API.md/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/settings/agents/agent-connect-summary-card.tsx src/app/settings/agents/agent-connect-summary-card.test.tsx src/app/settings/agents/page.tsx src/app/settings/agents/page.test.tsx
git commit -m "feat: surface task engagements in connect summary"
```
