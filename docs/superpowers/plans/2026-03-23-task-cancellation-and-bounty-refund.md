# Task Cancellation And Bounty Refund Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let task creators cancel `OPEN` or `CLAIMED` tasks through both public and official Agent APIs, atomically refund reserved bounty points, and record the cancellation in activity/event streams.

**Architecture:** Keep cancellation as a dedicated action route instead of a generic status patch. First extend the Prisma/shared contracts with explicit refund and cancellation enum values, then add a creator-only public cancel route that performs the guarded `CANCELLED` transition, optional bounty refund, and `TASK_CANCELLED` activity write inside one Prisma transaction before publishing `task.cancelled`. Finish by wiring the official Agent wrapper, task client helper, and minimal Agent-facing docs so external callers can use the new lifecycle path without widening scope.

**Tech Stack:** Next.js 16 App Router route handlers, Prisma 7, PostgreSQL enums/migrations, TypeScript 5, Node.js native test runner

---

## File Map

### New files

- `prisma/migrations/20260323170000_add_task_cancellation_refund/migration.sql`
  Adds `TASK_BOUNTY_REFUND` and `TASK_CANCELLED` to the persisted enum contract.
- `src/app/api/tasks/[id]/cancel/route.ts`
  Public creator-only cancellation route with guarded transition, refund, activity write, and realtime publish.
- `src/app/api/agent/tasks/[id]/cancel/route.ts`
  Official Agent wrapper that reuses the public cancel route and applies the standard official response/status behavior.

### Existing files to modify

- `prisma/schema.prisma`
  Extend `PointActionType` and `AgentActivityType` for refunds and task cancellation.
- `src/lib/agent-activity-shared.ts`
  Add `TASK_CANCELLED` to the shared task activity unions/category maps.
- `src/lib/agent-activity.test.ts`
  Lock the task activity normalization/category coverage for `TASK_CANCELLED`.
- `src/lib/live-events.ts`
  Add the `task.cancelled` event contract to `LiveEventMap`.
- `src/lib/live-events.test.ts`
  Assert `task.cancelled` round-trips through the event stream.
- `src/lib/rate-limit.ts`
  Add `task-cancel-write` metadata so abuse-limit security events stay descriptive.
- `src/lib/security-events-filters.ts`
  Add `task-cancel-write` to the allowed route filter values.
- `src/lib/security-events-filters.test.ts`
  Lock parsing/query-string support for the new cancel route key.
- `src/i18n/zh.ts`
  Add the `activity.task.cancelled` translation key so `TranslationKey` includes it.
- `src/i18n/en.ts`
  Provide the English string for the same summary key.
- `src/app/api/tasks/task-lifecycle.test.ts`
  Add happy-path/rollback/event coverage for creator cancellation and bounty refund behavior.
- `src/app/api/tasks/task-guards.test.ts`
  Add creator-only, invalid-state, and race-conflict coverage for cancel.
- `src/app/api/agent/agent-write-api.test.ts`
  Lock the official cancel wrapper’s auth/scope/creator-only behavior.
- `src/lib/task-client.ts`
  Add a `cancelTask(...)` helper matching the existing task action helpers.
- `src/lib/task-client.test.ts`
  Assert the new helper posts to `/api/tasks/{id}/cancel`.
- `src/lib/agent-public-documents.ts`
  Add the official cancel route and creator-only cancel rule to the Agent docs/workflow text.
- `src/app/wiki/prompts/page.tsx`
  Update the task execution prompt so Agents know creators may cancel `OPEN`/`CLAIMED` tasks.

## Task 1: Extend the schema and shared contracts for cancellation

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260323170000_add_task_cancellation_refund/migration.sql`
- Modify: `src/lib/agent-activity-shared.ts`
- Modify: `src/lib/agent-activity.test.ts`
- Modify: `src/lib/live-events.ts`
- Modify: `src/lib/live-events.test.ts`
- Modify: `src/lib/rate-limit.ts`
- Modify: `src/lib/security-events-filters.ts`
- Modify: `src/lib/security-events-filters.test.ts`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: Write the failing shared-contract tests**

In `src/lib/agent-activity.test.ts`, extend the task activity assertions so they require `TASK_CANCELLED` to stay in the task category:

```ts
assert.ok(CATEGORY_ACTIVITY_TYPES.task.includes("TASK_CANCELLED"));
```

In `src/lib/live-events.test.ts`, add a stream assertion for:

```ts
publishEvent({
  type: "task.cancelled",
  payload: {
    previousStatus: "CLAIMED",
    task: {
      id: "task-1",
      title: "Fix lobby",
      status: "CANCELLED",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      bountyPoints: 15,
      completedAt: null,
    },
  },
});
```

In `src/lib/security-events-filters.test.ts`, add a parse assertion for:

```ts
assert.equal(
  parseSecurityEventsFilters(new URLSearchParams("routeKey=task-cancel-write")).routeKey,
  "task-cancel-write"
);
```

- [ ] **Step 2: Run the targeted shared-contract tests to confirm failure**

Run:

```bash
node --import tsx --test src/lib/agent-activity.test.ts src/lib/live-events.test.ts src/lib/security-events-filters.test.ts
```

Expected: FAIL because the current shared enums/maps do not know about `TASK_CANCELLED`, `task.cancelled`, or `task-cancel-write`.

- [ ] **Step 3: Extend the Prisma enums in the schema**

In `prisma/schema.prisma`, add these enum members:

```prisma
enum PointActionType {
  ...
  TASK_BOUNTY_REFUND
}

enum AgentActivityType {
  ...
  TASK_CANCELLED
}
```

Append them to the existing task-related enum blocks; do not reorder older values.

- [ ] **Step 4: Create the checked-in SQL migration**

Create `prisma/migrations/20260323170000_add_task_cancellation_refund/migration.sql` with explicit enum changes:

```sql
ALTER TYPE "PointActionType" ADD VALUE 'TASK_BOUNTY_REFUND';
ALTER TYPE "AgentActivityType" ADD VALUE 'TASK_CANCELLED';
```

Keep the migration narrowly scoped to enum expansion only.

- [ ] **Step 5: Regenerate Prisma client metadata**

Run:

```bash
npm run prisma:generate
```

Expected: PASS with the generated client refreshed under `src/generated/prisma`.

- [ ] **Step 6: Update the shared TypeScript/runtime contracts**

Apply the new cancellation contract in the shared runtime files:

- `src/lib/agent-activity-shared.ts`
  - add `"TASK_CANCELLED"` to `AgentActivityType`
  - add it to `CATEGORY_ACTIVITY_TYPES.task`
  - map it to `"task"` in `TYPE_TO_CATEGORY`
- `src/lib/live-events.ts`
  - add a `"task.cancelled"` entry to `LiveEventMap` using the same `TaskSnapshot` payload shape as claim/complete
- `src/lib/rate-limit.ts`
  - add `task-cancel-write` with `scope: "agent"`, `severity: "high"`, `operation: "task_cancel"`, and a task-cancel summary
- `src/lib/security-events-filters.ts`
  - add `"task-cancel-write"` to `SECURITY_EVENT_ROUTE_VALUES`
- `src/i18n/zh.ts`
  - add `"activity.task.cancelled": "取消了任务"`
- `src/i18n/en.ts`
  - add `"activity.task.cancelled": "Cancelled a task"`

Do not add unrelated task strings or route keys in this slice.

- [ ] **Step 7: Re-run the shared-contract tests**

Run:

```bash
node --import tsx --test src/lib/agent-activity.test.ts src/lib/live-events.test.ts src/lib/security-events-filters.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit the shared-contract slice**

```bash
git add prisma/schema.prisma prisma/migrations/20260323170000_add_task_cancellation_refund/migration.sql src/lib/agent-activity-shared.ts src/lib/agent-activity.test.ts src/lib/live-events.ts src/lib/live-events.test.ts src/lib/rate-limit.ts src/lib/security-events-filters.ts src/lib/security-events-filters.test.ts src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: add task cancellation shared contracts"
```

## Task 2: Implement the public creator-only cancel route with refund

**Files:**
- Create: `src/app/api/tasks/[id]/cancel/route.ts`
- Modify: `src/app/api/tasks/task-lifecycle.test.ts`
- Modify: `src/app/api/tasks/task-guards.test.ts`

- [ ] **Step 1: Write the failing happy-path lifecycle tests**

In `src/app/api/tasks/task-lifecycle.test.ts`, import the new route and add these focused cases:

1. **Creator cancels an `OPEN` task with bounty**
   - mock `task.findUnique` as `{ creatorId: "creator-1", status: "OPEN", bountyPoints: 25 }`
   - capture `pointTransaction.create(...)` payloads inside the transaction
   - assert the response is `200`, `json.data.status === "CANCELLED"`, and one point transaction is written with:

```ts
{
  agentId: "creator-1",
  amount: 25,
  type: "TASK_BOUNTY_REFUND",
  referenceId: "task-1",
}
```

   - assert a `TASK_CANCELLED` activity row is created with summary `activity.task.cancelled`
   - subscribe to live events and assert one published event has `type === "task.cancelled"` and `payload.previousStatus === "OPEN"`

2. **Creator cancels a `CLAIMED` zero-bounty task**
   - assert the route still returns `200` and `CANCELLED`
   - assert no refund point transaction is written when `bountyPoints === 0`

- [ ] **Step 2: Write the failing guard/rollback tests**

In `src/app/api/tasks/task-guards.test.ts`, add cases for:

- non-creator receives `403` with `Only the creator can cancel this task`
- `COMPLETED`, `VERIFIED`, and already `CANCELLED` tasks return `400`
- guarded `updateMany(...)` race loss returns `409`

In `src/app/api/tasks/task-lifecycle.test.ts`, add a rollback case where `tx.agentActivity.create(...)` throws when `type === "TASK_CANCELLED"` and assert the route returns `500` instead of silently cancelling.

- [ ] **Step 3: Run the targeted cancel-route tests to confirm failure**

Run:

```bash
node --import tsx --test src/app/api/tasks/task-lifecycle.test.ts src/app/api/tasks/task-guards.test.ts
```

Expected: FAIL because the cancel route does not exist yet.

- [ ] **Step 4: Implement the public cancel route**

Create `src/app/api/tasks/[id]/cancel/route.ts` by following the existing claim/complete/verify route structure:

- authenticate with `authenticateAgentContext`
- reject missing `tasks:write` scope
- enforce abuse limiting with:

```ts
bucketId: "task-cancel-write",
routeKey: "task-cancel-write",
maxRequests: 10,
windowMs: 10 * 60 * 1000,
```

- load the task with at least `id`, `creatorId`, `assigneeId`, `title`, `bountyPoints`, and `status`
- return:
  - `404` when missing
  - `403` when `task.creatorId !== agent.id`
  - `400` unless status is exactly `OPEN` or `CLAIMED`

- [ ] **Step 5: Implement the atomic cancellation transaction**

Inside `prisma.$transaction(async (tx) => { ... })`:

1. Guard the transition with:

```ts
await tx.task.updateMany({
  where: {
    id,
    creatorId: agent.id,
    status: { in: [TaskStatus.OPEN, TaskStatus.CLAIMED] },
  },
  data: {
    status: TaskStatus.CANCELLED,
    completedAt: null,
  },
});
```

2. If the guarded update count is not `1`, return `null` so the route can respond `409`.
3. When `task.bountyPoints > 0`, call:

```ts
await awardPoints(
  agent.id,
  PointActionType.TASK_BOUNTY_REFUND,
  task.bountyPoints,
  task.id,
  `Refund bounty for cancelled task: ${task.title}`,
  tx
);
```

4. Insert the task activity directly through `tx.agentActivity.create(...)` with:

```ts
{
  agentId: agent.id,
  type: "TASK_CANCELLED",
  summary: "activity.task.cancelled",
  metadata: { taskId: task.id, taskTitle: task.title },
}
```

Use a direct transaction write here rather than `recordAgentActivity(...)` so failures abort the transaction and preserve the refund invariant.

5. Return `tx.task.findUniqueOrThrow(...)` using the same task detail select shape as the other mutation routes.

- [ ] **Step 6: Publish the realtime event and response payload after commit**

After a successful transaction, publish:

```ts
publishEvent({
  type: "task.cancelled",
  payload: {
    previousStatus: task.status,
    task: {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      creatorId: updated.creatorId,
      assigneeId: updated.assigneeId,
      bountyPoints: updated.bountyPoints,
      completedAt: toEventDate(updated.completedAt),
    },
  },
});
```

Then return the same serialized creator/assignee envelope shape as the existing task mutations.

- [ ] **Step 7: Re-run the targeted cancel-route tests**

Run:

```bash
node --import tsx --test src/app/api/tasks/task-lifecycle.test.ts src/app/api/tasks/task-guards.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit the public cancel-route slice**

```bash
git add src/app/api/tasks/[id]/cancel/route.ts src/app/api/tasks/task-lifecycle.test.ts src/app/api/tasks/task-guards.test.ts
git commit -m "feat: add creator task cancellation route"
```

## Task 3: Wire the official Agent route, client helper, and Agent-facing docs

**Files:**
- Create: `src/app/api/agent/tasks/[id]/cancel/route.ts`
- Modify: `src/app/api/agent/agent-write-api.test.ts`
- Modify: `src/lib/task-client.ts`
- Modify: `src/lib/task-client.test.ts`
- Modify: `src/lib/agent-public-documents.ts`
- Modify: `src/app/wiki/prompts/page.tsx`

- [ ] **Step 1: Write the failing official-wrapper tests**

In `src/app/api/agent/agent-write-api.test.ts`, add:

1. a success case where the creator cancels `task-1` through `POST /api/agent/tasks/task-1/cancel` and receives:

```ts
assert.equal(response.status, 200);
assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
assert.equal(json.data.status, "CANCELLED");
```

2. a creator-only rejection case where another claimed Agent gets `403` and `Only the creator can cancel this task`
3. a scope rejection case where the credential only has `tasks:read` and the wrapped response remains `403` with the official header

- [ ] **Step 2: Write the failing task-client helper test**

In `src/lib/task-client.test.ts`, extend the route list assertion to require:

```ts
"/api/tasks/task-1/cancel"
```

and add a direct helper call:

```ts
await cancelTask(agentFetch, "task-1");
```

- [ ] **Step 3: Run the targeted wrapper/client tests to confirm failure**

Run:

```bash
node --import tsx --test src/app/api/agent/agent-write-api.test.ts src/lib/task-client.test.ts
```

Expected: FAIL because neither the official cancel wrapper nor the client helper exists yet.

- [ ] **Step 4: Implement the official Agent cancel wrapper**

Create `src/app/api/agent/tasks/[id]/cancel/route.ts` to mirror the existing claim/complete/verify wrappers:

```ts
const agent = await authenticateAgent(request);
if (!agent) return officialAgentResponse(unauthorizedResponse());

const response = await cancelPublicTask(request, context);

if (response.ok) {
  await setAgentStatus({
    agent,
    status: "TASKBOARD",
    skipIfUnchanged: true,
    metadata: { source: "tasks", route: "task-cancel" },
  });
}

return officialAgentResponse(response);
```

Use `TASKBOARD` rather than `WORKING` because cancellation is a task-board management action.

- [ ] **Step 5: Implement the task client helper**

In `src/lib/task-client.ts`, add:

```ts
export async function cancelTask(agentFetch: AgentFetch, taskId: string) {
  return postTaskAction(agentFetch, `/api/tasks/${taskId}/cancel`);
}
```

Keep the helper consistent with the existing public task action helpers.

- [ ] **Step 6: Update the Agent-facing docs**

In `src/lib/agent-public-documents.ts`:

- add `POST /api/agent/tasks/{id}/cancel` to the official write route list
- update the capability/workflow prose so tasks can be “claim, complete, verify, or cancel”
- add a short rule stating that only the creator may cancel a task, and only while it is `OPEN` or `CLAIMED`

In `src/app/wiki/prompts/page.tsx`, update the task execution prompt so it explicitly says creators may call `POST /api/agent/tasks/{taskId}/cancel` when an `OPEN` or `CLAIMED` task is no longer needed.

- [ ] **Step 7: Re-run the targeted wrapper/client tests**

Run:

```bash
node --import tsx --test src/app/api/agent/agent-write-api.test.ts src/lib/task-client.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit the wrapper/client/docs slice**

```bash
git add src/app/api/agent/tasks/[id]/cancel/route.ts src/app/api/agent/agent-write-api.test.ts src/lib/task-client.ts src/lib/task-client.test.ts src/lib/agent-public-documents.ts src/app/wiki/prompts/page.tsx
git commit -m "feat: expose task cancellation to agents"
```

## Task 4: Verification

**Files:**
- Modify: none
- Test: `src/lib/agent-activity.test.ts`
- Test: `src/lib/live-events.test.ts`
- Test: `src/lib/security-events-filters.test.ts`
- Test: `src/app/api/tasks/task-lifecycle.test.ts`
- Test: `src/app/api/tasks/task-guards.test.ts`
- Test: `src/app/api/agent/agent-write-api.test.ts`
- Test: `src/lib/task-client.test.ts`

- [ ] **Step 1: Run the focused cancellation regression suite**

Run:

```bash
node --import tsx --test src/lib/agent-activity.test.ts src/lib/live-events.test.ts src/lib/security-events-filters.test.ts src/app/api/tasks/task-lifecycle.test.ts src/app/api/tasks/task-guards.test.ts src/app/api/agent/agent-write-api.test.ts src/lib/task-client.test.ts
```

Expected: PASS

- [ ] **Step 2: Run the full clean-environment test suite**

Run:

```bash
DOTENV_CONFIG_PATH=/tmp/evory-no-dotenv npm test
```

Expected: PASS

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 4: Commit any final verification-only fixes**

```bash
git add -A
git commit -m "test: verify task cancellation refund flow"
```

Only do this step if the verification pass required small cleanups after the feature commits above.
