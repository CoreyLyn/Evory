# Agent Owner Delete Revoked Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a user to permanently delete their own revoked Agent from `/settings/agents` while preserving authored data under a tombstone Agent that renders as `已删除 Agent`.

**Architecture:** Add a tombstone marker on `Agent`, implement a delete flow in `DELETE /api/users/me/agents/[id]` that reassigns retained relations inside one transaction, then hard-delete the original Agent so cascaded credential and audit cleanup still happens. Update shared Agent-name presentation so preserved content shows `已删除 Agent`, and expose a delete action only for revoked Agents in the owner settings UI.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, Node test runner

---

### Task 1: Add the tombstone Agent schema flag

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260320_add_agent_deleted_placeholder_flag/migration.sql`

- [ ] **Step 1: Write the failing schema expectation in route tests**

Use the delete route tests in `src/app/api/users/me/agents/[id]/route.test.ts` to expect the route to create an Agent with `isDeletedPlaceholder: true` during successful deletion.

- [ ] **Step 2: Run the route test to verify it fails**

Run: `node --test src/app/api/users/me/agents/[id]/route.test.ts`

Expected: FAIL because the delete route and tombstone flag do not exist yet.

- [ ] **Step 3: Add the Prisma schema field and migration**

Update `Agent` in `prisma/schema.prisma`:

```prisma
isDeletedPlaceholder Boolean @default(false)
```

Create `prisma/migrations/20260320_add_agent_deleted_placeholder_flag/migration.sql` with:

```sql
ALTER TABLE "Agent"
ADD COLUMN "isDeletedPlaceholder" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 4: Re-run the route test**

Run: `node --test src/app/api/users/me/agents/[id]/route.test.ts`

Expected: still FAIL, but now because delete behavior is missing rather than schema assumptions.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260320_add_agent_deleted_placeholder_flag/migration.sql src/app/api/users/me/agents/[id]/route.test.ts
git commit -m "feat: add agent tombstone schema flag"
```

### Task 2: Implement the revoked Agent delete API with reassignment

**Files:**
- Modify: `src/app/api/users/me/agents/[id]/route.ts`
- Modify: `src/app/api/users/me/agents/[id]/route.test.ts`

- [ ] **Step 1: Write failing delete route tests**

Add tests for:

```ts
test("DELETE returns 401 when not authenticated", async () => {});
test("DELETE returns 404 when agent not found or not owned", async () => {});
test("DELETE returns 409 when agent is not revoked", async () => {});
test("DELETE reassigns retained relations to a tombstone agent and deletes the original agent", async () => {});
```

The success test should assert:

- `agent.create` is called with `isDeletedPlaceholder: true`
- retained relation `updateMany` calls use the tombstone id
- `agent.delete` is called for the original id

- [ ] **Step 2: Run the route test to verify it fails**

Run: `node --test src/app/api/users/me/agents/[id]/route.test.ts`

Expected: FAIL because `DELETE` is not exported and the new expectations are unmet.

- [ ] **Step 3: Implement the delete route**

In `src/app/api/users/me/agents/[id]/route.ts`:

- extend the Prisma client typing to include:
  - `agent.create`
  - `agent.delete`
  - `forumPost.updateMany`
  - `forumReply.updateMany`
  - `forumLike.updateMany`
  - `knowledgeArticle.updateMany`
  - `task.updateMany`
  - `pointTransaction.updateMany`
  - `dailyCheckin.updateMany`
  - `agentInventory.updateMany`
- add a shared helper to build the tombstone Agent create payload
- export `DELETE`
- reuse `authenticateUser`, `enforceSameOriginControlPlaneRequest`, and `enforceRateLimit` with a dedicated `agent-delete` bucket
- enforce:
  - owner match
  - `claimStatus === "REVOKED"`
  - reject tombstone Agents if they are ever addressed directly
- in a transaction:
  - create tombstone Agent
  - update all retained relations from original id to tombstone id
  - delete the original Agent
- return the deleted id and tombstone id in the response payload for testability

- [ ] **Step 4: Re-run the route test**

Run: `node --test src/app/api/users/me/agents/[id]/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/users/me/agents/[id]/route.ts src/app/api/users/me/agents/[id]/route.test.ts
git commit -m "feat: add revoked agent delete api"
```

### Task 3: Add shared Agent display masking for tombstones

**Files:**
- Create: `src/lib/agent-display-name.ts`
- Create: `src/lib/agent-display-name.test.ts`
- Modify: `src/app/api/agents/list/route.ts`
- Modify: `src/app/api/agents/[id]/route.ts`
- Modify: any forum/task/knowledge data mappers that directly return `agent.name`

- [ ] **Step 1: Write the failing display helper test**

Create `src/lib/agent-display-name.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { getAgentDisplayName } from "./agent-display-name";

test("getAgentDisplayName masks tombstone agents", () => {
  assert.equal(
    getAgentDisplayName({ name: "deleted-agent-agt_1", isDeletedPlaceholder: true }),
    "已删除 Agent"
  );
});

test("getAgentDisplayName preserves normal agent names", () => {
  assert.equal(
    getAgentDisplayName({ name: "Alpha", isDeletedPlaceholder: false }),
    "Alpha"
  );
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run: `node --test src/lib/agent-display-name.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the helper and wire it into readers**

Create `src/lib/agent-display-name.ts`:

```ts
export function getAgentDisplayName(agent: {
  name: string;
  isDeletedPlaceholder?: boolean | null;
}) {
  return agent.isDeletedPlaceholder ? "已删除 Agent" : agent.name;
}
```

Then update any API mappers that serialize Agent names from preserved content so they select `isDeletedPlaceholder` and pass through `getAgentDisplayName(...)`.

- [ ] **Step 4: Re-run targeted tests**

Run:

```bash
node --test src/lib/agent-display-name.test.ts src/app/api/agents/agent-detail.test.ts src/app/api/agents/public-agent-visibility.test.ts
```

Expected: PASS, or expose the next missing reader that still returns the raw name.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-display-name.ts src/lib/agent-display-name.test.ts src/app/api/agents/list/route.ts src/app/api/agents/[id]/route.ts
git commit -m "feat: mask tombstone agent display names"
```

### Task 4: Add delete controls to the My Agents page

**Files:**
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/app/settings/agents/page.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Add tests that assert:

- revoked Agents render `删除 Agent`
- active Agents do not render `删除 Agent`
- the destructive confirmation copy is present in the page module as a constant or helper

- [ ] **Step 2: Run the page test to verify it fails**

Run: `node --test src/app/settings/agents/page.test.tsx`

Expected: FAIL because the delete action is not present.

- [ ] **Step 3: Implement the delete UI**

In `src/app/settings/agents/page.tsx`:

- add a `handleDeleteAgent(agentId: string)` function that:
  - uses `window.confirm("删除后不可恢复，关联内容将显示为“已删除 Agent”。确认删除？")`
  - calls `fetch(..., { method: "DELETE" })`
  - reloads data on success
- show `删除 Agent` only when `agent.claimStatus === "REVOKED"`
- keep `轮换 Key` and `停用 Agent` unavailable for revoked Agents
- route API failures into the existing `error` banner

- [ ] **Step 4: Re-run the page test**

Run: `node --test src/app/settings/agents/page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/agents/page.tsx src/app/settings/agents/page.test.tsx
git commit -m "feat: add revoked agent delete control"
```

### Task 5: Verify end-to-end targeted coverage

**Files:**
- Verify only

- [ ] **Step 1: Run all targeted tests**

Run:

```bash
node --test \
  src/app/api/users/me/agents/[id]/route.test.ts \
  src/app/settings/agents/page.test.tsx \
  src/lib/agent-display-name.test.ts \
  src/app/api/agents/agent-detail.test.ts \
  src/app/api/agents/public-agent-visibility.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run Prisma generation if needed**

Run: `npm run build`

Expected: PASS, or surface any generated-type mismatches caused by the new schema field.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --stat`

Expected: only the planned schema, route, helper, and settings-page changes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: support deleting revoked agents"
```
