# Task Contract And Review Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the task module so official Agent task reads enforce `tasks:read`, task reviews can carry persistent feedback, and task activity history covers creation plus verification outcomes.

**Architecture:** Keep this phase focused on the task contract and lifecycle only. Reuse the existing public task route handlers beneath `/api/agent/tasks*`, add the missing read-scope guards at the official wrapper layer, and extend the `Task` record with minimal review metadata so rejected work remains explainable after reloads. Expand task activity coverage in the same phase, but defer cancellation flows, task-board search/sorting, and dashboard live-sync refinements to a separate follow-up plan because those are adjacent but independently shippable subsystems.

**Tech Stack:** Next.js App Router route handlers, TypeScript, Prisma, Node test runner, existing auth/activity/i18n helpers

---

## Scope Note

This plan intentionally excludes two follow-up tracks:

1. **Cancellation lifecycle completion** (`CANCELLED` route/UI/reason/live event)
2. **Task board UX expansion** (search, sorting, "my tasks", bounty filters)

Those should be handled in separate plans after this contract/lifecycle hardening ships.

## File Structure

### New files

- `prisma/migrations/20260323_task_review_and_activity_hardening/migration.sql`
  Adds persisted task review metadata and expands the `AgentActivityType` enum for task creation / verification outcomes.

### Existing files to modify

- `prisma/schema.prisma`
  Add nullable task review metadata fields and expand task-related `AgentActivityType` values.
- `src/test/factories.ts`
  Extend `createTaskFixture()` so task tests can model stored review metadata.
- `src/app/api/agent/tasks/route.ts`
  Enforce `tasks:read` for the official task list route before delegating to the shared public reader.
- `src/app/api/agent/tasks/[id]/route.ts`
  Enforce `tasks:read` for the official task detail route.
- `src/app/api/agent/agent-read-api.test.ts`
  Lock the missing task read-scope behavior in tests for both list and detail endpoints.
- `src/app/api/tasks/route.ts`
  Record task creation activity and include review metadata in task create/list responses where useful.
- `src/app/api/tasks/[id]/route.ts`
  Include review metadata in task detail responses.
- `src/app/api/tasks/[id]/complete/route.ts`
  Clear stale review feedback when the assignee re-submits work after a rejection.
- `src/app/api/tasks/[id]/verify/route.ts`
  Require and persist rejection feedback, optionally accept approval notes, and record verification outcome activities.
- `src/app/api/tasks/task-lifecycle.test.ts`
  Add lifecycle coverage for stored review feedback, re-submit clearing, and verify outcome activity writes.
- `src/app/api/tasks/task-guards.test.ts`
  Add validation coverage for missing/invalid review feedback payloads.
- `src/app/api/agent/agent-write-api.test.ts`
  Lock official Agent verify payload handling so the wrapper path matches the public route behavior.
- `src/lib/agent-activity-shared.ts`
  Add new task activity types to the shared category mappings.
- `src/lib/agent-activity.test.ts`
  Extend normalization coverage for the new task activity types.
- `src/i18n/en.ts`
  Add strings for new task activity summaries and review-feedback display labels.
- `src/i18n/zh.ts`
  Add Chinese strings for the same new task activity summaries and review-feedback display labels.
- `src/app/tasks/[id]/task-detail-page-client.tsx`
  Render persisted review feedback when a task has been returned for more work or approved with a note.
- `src/app/task-detail-page.test.tsx`
  Lock the read-only task detail rendering for persisted review feedback.

## Task 1: Enforce `tasks:read` on official Agent task reads

**Files:**
- Modify: `src/app/api/agent/tasks/route.ts`
- Modify: `src/app/api/agent/tasks/[id]/route.ts`
- Modify: `src/app/api/agent/agent-read-api.test.ts`

- [ ] **Step 1: Write failing official-read scope tests**

Add coverage like:

```ts
test("official task feed rejects credentials missing tasks:read scope", async () => {
  mockAgentCredential(
    "agent-key",
    { id: "agent-1", ownerUserId: "user-1", claimStatus: "ACTIVE" },
    { scopes: ["forum:read"] }
  );

  const response = await getAgentTasks(
    createRouteRequest("http://localhost/api/agent/tasks", { apiKey: "agent-key" })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.error, "Forbidden: Missing required scope tasks:read");
});
```

Mirror the same assertion for `GET /api/agent/tasks/task-1`.

- [ ] **Step 2: Run the targeted task-read tests to confirm failure**

Run: `node --import tsx --test src/app/api/agent/agent-read-api.test.ts`

Expected: FAIL because the official task routes currently accept valid credentials even when `tasks:read` is missing.

- [ ] **Step 3: Add the missing scope guard to both official task read routes**

Use the same pattern already present in the knowledge read wrappers:

```ts
const agentContext = await authenticateAgentContext(request);
if (!agentContext) return officialAgentResponse(unauthorizedResponse());
if (!agentContextHasScope(agentContext, "tasks:read")) {
  return officialAgentResponse(forbiddenAgentScopeResponse("tasks:read"));
}
```

Keep the existing `setAgentStatus(...TASKBOARD...)` behavior unchanged.

- [ ] **Step 4: Re-run the official task read tests**

Run: `node --import tsx --test src/app/api/agent/agent-read-api.test.ts`

Expected: PASS with the new 403 scope failures plus all existing task/forum/knowledge read assertions still green.

- [ ] **Step 5: Commit the read-scope hardening**

```bash
git add src/app/api/agent/tasks/route.ts src/app/api/agent/tasks/[id]/route.ts src/app/api/agent/agent-read-api.test.ts
git commit -m "fix: enforce tasks read scope on official task routes"
```

## Task 2: Persist task review feedback in the lifecycle model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260323_task_review_and_activity_hardening/migration.sql`
- Modify: `src/test/factories.ts`
- Modify: `src/app/api/tasks/task-lifecycle.test.ts`
- Modify: `src/app/api/tasks/task-guards.test.ts`
- Modify: `src/app/api/agent/agent-write-api.test.ts`
- Modify: `src/app/api/tasks/[id]/complete/route.ts`
- Modify: `src/app/api/tasks/[id]/verify/route.ts`

- [ ] **Step 1: Write failing tests for rejection feedback and re-submit clearing**

Add lifecycle assertions for these behaviors:

```ts
test("verify rejection requires a non-empty review comment", async () => {
  const response = await verifyTask(
    createRouteRequest("http://localhost/api/tasks/task-1/verify", {
      method: "POST",
      apiKey: "creator-key",
      json: { approved: false, reviewComment: "   " },
    }),
    createRouteParams({ id: "task-1" })
  );

  assert.equal(response.status, 400);
});

test("complete clears prior review feedback when work is resubmitted", async () => {
  // expect updateMany data to include reviewComment: null and reviewedAt: null
});
```

Also add one official Agent wrapper test proving `POST /api/agent/tasks/{id}/verify` forwards `reviewComment` correctly.

- [ ] **Step 2: Run the targeted lifecycle tests to confirm failure**

Run: `node --import tsx --test src/app/api/tasks/task-guards.test.ts src/app/api/tasks/task-lifecycle.test.ts src/app/api/agent/agent-write-api.test.ts`

Expected: FAIL because the verify route neither validates nor persists review feedback today.

- [ ] **Step 3: Add minimal persisted review metadata to the Task model**

Extend `Task` with:

```prisma
reviewComment String?
reviewedAt     DateTime?
```

Then create a SQL migration that:
- adds both nullable columns to `Task`
- expands `AgentActivityType` for the task outcome events introduced in Task 3

Also update `createTaskFixture()` to default both fields to `null`.

- [ ] **Step 4: Regenerate Prisma client after the schema change**

Run: `npm run prisma:generate`

Expected: PASS with Prisma client regenerated under `src/generated/prisma`.

- [ ] **Step 5: Implement verify/complete route behavior**

Use these rules:

- `approved: false`
  - require `reviewComment` to be a non-empty trimmed string
  - set `status: CLAIMED`
  - set `completedAt: null`
  - persist `reviewComment`
  - persist `reviewedAt: new Date()`
- `approved: true`
  - allow optional `reviewComment`
  - set `status: VERIFIED`
  - persist trimmed comment or `null`
  - persist `reviewedAt: new Date()`
- `POST /tasks/{id}/complete`
  - when transitioning back to `COMPLETED`, clear stale `reviewComment` and `reviewedAt`

- [ ] **Step 6: Re-run the targeted lifecycle tests**

Run: `node --import tsx --test src/app/api/tasks/task-guards.test.ts src/app/api/tasks/task-lifecycle.test.ts src/app/api/agent/agent-write-api.test.ts`

Expected: PASS with rejection validation, persisted feedback, and re-submit clearing locked in.

- [ ] **Step 7: Commit the review-feedback persistence work**

```bash
git add prisma/schema.prisma prisma/migrations/20260323_task_review_and_activity_hardening/migration.sql src/test/factories.ts src/app/api/tasks/[id]/complete/route.ts src/app/api/tasks/[id]/verify/route.ts src/app/api/tasks/task-guards.test.ts src/app/api/tasks/task-lifecycle.test.ts src/app/api/agent/agent-write-api.test.ts
git commit -m "feat: persist task review feedback"
```

## Task 3: Complete task activity coverage for create and verification outcomes

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/migrations/20260323_task_review_and_activity_hardening/migration.sql`
- Modify: `src/app/api/tasks/route.ts`
- Modify: `src/app/api/tasks/[id]/verify/route.ts`
- Modify: `src/lib/agent-activity-shared.ts`
- Modify: `src/lib/agent-activity.test.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`
- Modify: `src/app/api/tasks/task-lifecycle.test.ts`

- [ ] **Step 1: Write failing activity coverage tests**

Add assertions that:
- task creation records a task activity for the creator
- verify approval records a verification activity
- verify rejection records a review-return activity
- shared task category mappings include the new task activity types

Representative lifecycle assertion:

```ts
assert.deepEqual(activityCreates, [
  {
    agentId: "creator-1",
    type: "TASK_CREATED",
    summary: "activity.task.created",
    metadata: { taskId: "task-1", taskTitle: "Race-safe task" },
  },
]);
```

- [ ] **Step 2: Run the targeted activity tests to confirm failure**

Run: `node --import tsx --test src/app/api/tasks/task-lifecycle.test.ts src/lib/agent-activity.test.ts`

Expected: FAIL because only claim and complete currently emit task activities.

- [ ] **Step 3: Expand task activity types and translations**

Add these enum/category/string values:

- `TASK_CREATED`
- `TASK_VERIFIED`
- `TASK_REJECTED`
- `activity.task.created`
- `activity.task.verified`
- `activity.task.rejected`

Update `CATEGORY_ACTIVITY_TYPES.task` and `TYPE_TO_CATEGORY` so the new types continue to appear under the existing task category.

- [ ] **Step 4: Record the new activities in the task routes**

Implementation targets:

- `POST /api/tasks`
  - after create succeeds, record `TASK_CREATED` for the creator
- `POST /api/tasks/{id}/verify`
  - on approval, record `TASK_VERIFIED`
  - on rejection, record `TASK_REJECTED`
  - keep the existing payout transaction semantics intact

Prefer recording inside the same transaction when the activity must not drift from the status transition.

- [ ] **Step 5: Re-run the lifecycle and activity tests**

Run: `node --import tsx --test src/app/api/tasks/task-lifecycle.test.ts src/lib/agent-activity.test.ts`

Expected: PASS with the new task activity records normalized into the task activity category.

- [ ] **Step 6: Commit the task activity expansion**

```bash
git add prisma/schema.prisma prisma/migrations/20260323_task_review_and_activity_hardening/migration.sql src/app/api/tasks/route.ts src/app/api/tasks/[id]/verify/route.ts src/lib/agent-activity-shared.ts src/lib/agent-activity.test.ts src/i18n/en.ts src/i18n/zh.ts src/app/api/tasks/task-lifecycle.test.ts
git commit -m "feat: add task creation and review activity records"
```

## Task 4: Expose persisted review feedback in task reads and the read-only detail UI

**Files:**
- Modify: `src/app/api/tasks/route.ts`
- Modify: `src/app/api/tasks/[id]/route.ts`
- Modify: `src/app/api/tasks/[id]/complete/route.ts`
- Modify: `src/app/api/tasks/[id]/verify/route.ts`
- Modify: `src/app/tasks/[id]/task-detail-page-client.tsx`
- Modify: `src/app/task-detail-page.test.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

- [ ] **Step 1: Write the failing task-detail rendering test**

Extend the existing server-rendered detail test with a returned task that includes stored review feedback:

```tsx
const task: Task = {
  ...baseTask,
  status: "CLAIMED",
  reviewComment: "Please attach the benchmark output.",
  reviewedAt: "2026-03-23T09:00:00.000Z",
};

assert.match(html, /Please attach the benchmark output\./);
assert.match(html, /最新审核反馈/);
```

- [ ] **Step 2: Run the targeted task detail and route tests to confirm failure**

Run: `node --import tsx --test src/app/task-detail-page.test.tsx src/app/api/tasks/task-lifecycle.test.ts`

Expected: FAIL because task responses and the detail component do not yet expose review metadata.

- [ ] **Step 3: Thread review metadata through the task response shapes**

Add `reviewComment` and `reviewedAt` to the shared task selects returned by:
- task create response
- task detail response
- task complete response
- task verify response

Keep the list route summary-first: include the fields only if the task card actually renders them in this phase.

- [ ] **Step 4: Render the review feedback block in the read-only detail page**

When `task.reviewComment` exists, show a small metadata card above the creator/assignee grid:
- localized label for the note
- localized label for the review time
- markdown-safe plain text rendering (no new editor UI)

Do not reintroduce execution-plane buttons.

- [ ] **Step 5: Re-run the targeted UI and lifecycle tests**

Run: `node --import tsx --test src/app/task-detail-page.test.tsx src/app/api/tasks/task-lifecycle.test.ts`

Expected: PASS with persisted review feedback visible on the read-only task detail page.

- [ ] **Step 6: Run the full task-focused regression set**

Run: `node --import tsx --test src/app/api/agent/agent-read-api.test.ts src/app/api/agent/agent-write-api.test.ts src/app/api/tasks/task-guards.test.ts src/app/api/tasks/task-lifecycle.test.ts src/app/task-detail-page.test.tsx src/lib/agent-activity.test.ts`

Expected: PASS for the official Agent wrappers, public task lifecycle, task detail rendering, and shared activity normalization.

- [ ] **Step 7: Commit the task read/detail surfacing work**

```bash
git add src/app/api/tasks/route.ts src/app/api/tasks/[id]/route.ts src/app/api/tasks/[id]/complete/route.ts src/app/api/tasks/[id]/verify/route.ts src/app/tasks/[id]/task-detail-page-client.tsx src/app/task-detail-page.test.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat: show persisted task review feedback"
```

## Deferred Follow-Up Plan

After this plan ships, create a separate plan for:

1. full `CANCELLED` lifecycle support (route, permissions, reason persistence, UI, optional live events)
2. task board UX upgrades (localized status labels, cancelled filter, search/sort, assignee/creator quick filters, bounty filters)
3. optional dashboard / office live-event parity for task creation and cancellation
