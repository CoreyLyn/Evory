# Agent Status Timeout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent 运行时状态在 30 分钟无活动后自动回落为 OFFLINE，防止 Agent 崩溃后状态僵死。

**Architecture:** 数据库新增 `statusExpiresAt` 字段记录过期时间。状态变更和 API 认证时刷新过期时间。全局 `setInterval` 定时器每 5 分钟扫描过期 Agent 并批量置 OFFLINE。

**Tech Stack:** Prisma 7 · Node.js native test runner · Next.js App Router

**Spec:** `docs/superpowers/specs/2026-03-16-agent-status-timeout-design.md`

---

## Chunk 1: Database & Core Scanner

### Task 1: Add `statusExpiresAt` field to Agent model

**Files:**
- Modify: `prisma/schema.prisma:130-163`

- [ ] **Step 1: Add field and index to schema**

In `prisma/schema.prisma`, inside `model Agent` (after `lastSeenAt` on line 138), add:

```prisma
  statusExpiresAt DateTime?
```

And inside the index block (after line 162 `@@index([status])`), add:

```prisma
  @@index([statusExpiresAt])
```

- [ ] **Step 2: Generate Prisma Client**

Run: `npm run prisma:generate`
Expected: Prisma Client regenerated successfully

- [ ] **Step 3: Push schema to database**

Run: `npm run db:push`
Expected: Schema synced, new column added

- [ ] **Step 4: Run data migration for existing agents**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
UPDATE "Agent" SET "statusExpiresAt" = NOW() + INTERVAL '30 minutes'
WHERE "status" != 'OFFLINE' AND "statusExpiresAt" IS NULL;
SQL
```
Expected: Any non-OFFLINE agents get a `statusExpiresAt` 30 minutes in the future

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add statusExpiresAt field to Agent model"
```

---

### Task 2: Create timeout scanner module

**Files:**
- Create: `src/lib/agent-status-timeout.ts`
- Create: `src/lib/agent-status-timeout.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/lib/agent-status-timeout.test.ts`:

```typescript
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  scanExpiredAgentStatuses,
  STATUS_TIMEOUT_MS,
  SCAN_INTERVAL_MS,
  startStatusTimeoutScanner,
  stopStatusTimeoutScanner,
  resetAgentStatusTimeoutForTest,
} from "./agent-status-timeout";
import { resetLiveEventsForTest } from "./live-events";

// ── Prisma mock types ──

type FindManyArgs = {
  where: Record<string, unknown>;
  select: Record<string, boolean>;
};

type UpdateManyArgs = {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
};

type ActivityCreateArgs = {
  data: {
    agentId: string;
    type: string;
    summary: string;
    metadata: Record<string, unknown>;
  };
};

type PrismaMock = {
  agent: {
    findMany: (args: FindManyArgs) => Promise<unknown[]>;
    updateMany: (args: UpdateManyArgs) => Promise<{ count: number }>;
  };
  agentActivity: {
    create: (args: ActivityCreateArgs) => Promise<unknown>;
  };
};

const db = prisma as unknown as PrismaMock;
const originalFindMany = db.agent.findMany;
const originalUpdateMany = db.agent.updateMany;
const originalActivityCreate = db.agentActivity.create;

beforeEach(() => {
  resetLiveEventsForTest();
  resetAgentStatusTimeoutForTest();
});

afterEach(() => {
  resetAgentStatusTimeoutForTest();
  db.agent.findMany = originalFindMany;
  db.agent.updateMany = originalUpdateMany;
  db.agentActivity.create = originalActivityCreate;
});

test("STATUS_TIMEOUT_MS is 30 minutes", () => {
  assert.equal(STATUS_TIMEOUT_MS, 30 * 60 * 1000);
});

test("SCAN_INTERVAL_MS is 5 minutes", () => {
  assert.equal(SCAN_INTERVAL_MS, 5 * 60 * 1000);
});

test("scanExpiredAgentStatuses updates expired agents to OFFLINE", async () => {
  const expiredAgents = [
    { id: "agent-1", name: "Agent1", type: "CUSTOM", status: "WORKING", points: 10, avatarConfig: {}, bio: "", createdAt: new Date(), updatedAt: new Date() },
    { id: "agent-2", name: "Agent2", type: "CUSTOM", status: "ONLINE", points: 5, avatarConfig: {}, bio: "", createdAt: new Date(), updatedAt: new Date() },
  ];

  db.agent.findMany = async () => expiredAgents;
  db.agent.updateMany = async () => ({ count: 2 });
  db.agentActivity.create = async () => ({});

  const count = await scanExpiredAgentStatuses();

  assert.equal(count, 2);
});

test("scanExpiredAgentStatuses returns 0 when no agents are expired", async () => {
  db.agent.findMany = async () => [];

  const count = await scanExpiredAgentStatuses();

  assert.equal(count, 0);
});

test("scanExpiredAgentStatuses uses same WHERE condition for findMany and updateMany", async () => {
  let findWhere: Record<string, unknown> | null = null;
  let updateWhere: Record<string, unknown> | null = null;

  db.agent.findMany = async (args: FindManyArgs) => {
    findWhere = args.where;
    return [{ id: "agent-1", name: "A", type: "CUSTOM", status: "ONLINE", points: 0, avatarConfig: {}, bio: "", createdAt: new Date(), updatedAt: new Date() }];
  };
  db.agent.updateMany = async (args: UpdateManyArgs) => {
    updateWhere = args.where;
    return { count: 1 };
  };
  db.agentActivity.create = async () => ({});

  await scanExpiredAgentStatuses();

  assert.ok(findWhere);
  assert.ok(updateWhere);
  // Both should filter on status != OFFLINE and statusExpiresAt < now
  assert.deepEqual(Object.keys(findWhere!).sort(), Object.keys(updateWhere!).sort());
  assert.deepEqual(findWhere!.status, updateWhere!.status);
  // Both should have statusExpiresAt with lt condition
  assert.ok((findWhere!.statusExpiresAt as Record<string, unknown>).lt);
  assert.ok((updateWhere!.statusExpiresAt as Record<string, unknown>).lt);
});

test("scanExpiredAgentStatuses records STATUS_CHANGED activity with timeout source", async () => {
  const activities: ActivityCreateArgs["data"][] = [];

  db.agent.findMany = async () => [
    { id: "agent-1", name: "A", type: "CUSTOM", status: "WORKING", points: 0, avatarConfig: {}, bio: "", createdAt: new Date(), updatedAt: new Date() },
  ];
  db.agent.updateMany = async () => ({ count: 1 });
  db.agentActivity.create = async (args: ActivityCreateArgs) => {
    activities.push(args.data);
    return {};
  };

  await scanExpiredAgentStatuses();

  assert.equal(activities.length, 1);
  assert.equal(activities[0].agentId, "agent-1");
  assert.equal(activities[0].type, "STATUS_CHANGED");
  assert.equal((activities[0].metadata as Record<string, unknown>).source, "timeout");
  assert.equal((activities[0].metadata as Record<string, unknown>).previousStatus, "WORKING");
  assert.equal((activities[0].metadata as Record<string, unknown>).newStatus, "OFFLINE");
});

test("startStatusTimeoutScanner and stopStatusTimeoutScanner manage timer lifecycle", () => {
  startStatusTimeoutScanner();
  // calling start again should not throw or create duplicate
  startStatusTimeoutScanner();

  stopStatusTimeoutScanner();
  // calling stop again should not throw
  stopStatusTimeoutScanner();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/agent-status-timeout.test.ts`
Expected: FAIL — module `./agent-status-timeout` not found

- [ ] **Step 3: Write the scanner implementation**

Create `src/lib/agent-status-timeout.ts`:

```typescript
import prisma from "./prisma";
import { publishEvent } from "./live-events";
import { recordAgentActivity } from "./agent-activity";

export const STATUS_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type ExpiredAgent = {
  id: string;
  name: string;
  type: string;
  status: string;
  points: number;
  avatarConfig: unknown;
  bio: string;
  createdAt: Date;
  updatedAt: Date;
};

export async function scanExpiredAgentStatuses(): Promise<number> {
  const now = new Date();

  const whereExpired = {
    status: { not: "OFFLINE" as const },
    statusExpiresAt: { lt: now },
  };

  const expiredAgents: ExpiredAgent[] = await (prisma.agent.findMany as Function)({
    where: whereExpired,
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      points: true,
      avatarConfig: true,
      bio: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (expiredAgents.length === 0) return 0;

  const result = await (prisma.agent.updateMany as Function)({
    where: whereExpired,
    data: { status: "OFFLINE", statusExpiresAt: null },
  });

  for (const agent of expiredAgents) {
    publishEvent({
      type: "agent.status.updated",
      payload: {
        previousStatus: agent.status,
        agent: {
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: "OFFLINE",
          points: agent.points,
          avatarConfig:
            agent.avatarConfig &&
            typeof agent.avatarConfig === "object" &&
            !Array.isArray(agent.avatarConfig)
              ? (agent.avatarConfig as Record<string, unknown>)
              : undefined,
          bio: agent.bio,
          createdAt: agent.createdAt.toISOString(),
          updatedAt: agent.updatedAt.toISOString(),
        },
      },
    });

    await recordAgentActivity({
      agentId: agent.id,
      type: "STATUS_CHANGED",
      summary: "activity.status.timeout",
      metadata: {
        previousStatus: agent.status,
        newStatus: "OFFLINE",
        source: "timeout",
      },
    });
  }

  return result.count;
}

// ── Global timer (globalThis pattern, same as live-events.ts) ──

declare global {
  var __agentStatusTimeoutTimer: ReturnType<typeof setInterval> | undefined;
}

export function startStatusTimeoutScanner(): void {
  if (globalThis.__agentStatusTimeoutTimer) return;

  globalThis.__agentStatusTimeoutTimer = setInterval(async () => {
    try {
      const count = await scanExpiredAgentStatuses();
      if (count > 0) {
        console.log(`[agent-status-timeout] Timed out ${count} agent(s)`);
      }
    } catch (error) {
      console.error("[agent-status-timeout]", error);
    }
  }, SCAN_INTERVAL_MS);
}

export function stopStatusTimeoutScanner(): void {
  if (globalThis.__agentStatusTimeoutTimer) {
    clearInterval(globalThis.__agentStatusTimeoutTimer);
    globalThis.__agentStatusTimeoutTimer = undefined;
  }
}

export function resetAgentStatusTimeoutForTest(): void {
  stopStatusTimeoutScanner();
}

// Auto-start on module load (skip in test environment)
if (process.env.NODE_ENV !== "test") {
  startStatusTimeoutScanner();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/agent-status-timeout.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-status-timeout.ts src/lib/agent-status-timeout.test.ts
git commit -m "feat: add agent status timeout scanner with tests"
```

---

## Chunk 2: API Changes & Cron Endpoint

### Task 3: Update status API to set `statusExpiresAt`

**Files:**
- Modify: `src/app/api/agents/me/status/route.ts`

- [ ] **Step 1: Add statusExpiresAt to status update**

In `src/app/api/agents/me/status/route.ts`, add the import at top:

```typescript
import { STATUS_TIMEOUT_MS } from "@/lib/agent-status-timeout";
```

Then modify the `prisma.agent.update` call (line 40-54). Replace the existing `data: { status },` (line 42) with:

```typescript
      data: {
        status,
        statusExpiresAt: status === "OFFLINE"
          ? null
          : new Date(Date.now() + STATUS_TIMEOUT_MS),
      },
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agents/me/status/route.ts
git commit -m "feat: set statusExpiresAt on agent status change"
```

---

### Task 4: Add statusExpiresAt renewal to auth context

**Files:**
- Modify: `src/lib/auth.ts:211-219`

- [ ] **Step 1: Update the lastSeenAt update to also renew statusExpiresAt**

In `src/lib/auth.ts`, add import at top:

```typescript
import { STATUS_TIMEOUT_MS } from "./agent-status-timeout";
```

Then modify the `agent.update` call (lines 212-218). Change from:

```typescript
      await authPrisma.agent?.update?.({
        where: {
          id: agent.id,
        },
        data: {
          lastSeenAt: lastUsedAt,
        },
      });
```

To:

```typescript
      await authPrisma.agent?.update?.({
        where: {
          id: agent.id,
        },
        data: {
          lastSeenAt: lastUsedAt,
          ...(agent.status !== "OFFLINE"
            ? { statusExpiresAt: new Date(Date.now() + STATUS_TIMEOUT_MS) }
            : {}),
        },
      });
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run existing auth tests**

Run: `node --import tsx --test src/lib/auth.test.ts`
Expected: All existing tests PASS (renewal is best-effort, tests mock `agent.update`)

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: renew statusExpiresAt on every authenticated API call"
```

---

### Task 5: Create cron trigger endpoint

**Files:**
- Create: `src/app/api/cron/agent-status-timeout/route.ts`
- Create: `src/app/api/cron/agent-status-timeout/route.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/app/api/cron/agent-status-timeout/route.test.ts`:

```typescript
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { resetAgentStatusTimeoutForTest } from "@/lib/agent-status-timeout";
import { createRouteRequest } from "@/test/request-helpers";
import { POST } from "./route";

type PrismaMock = {
  agent: {
    findMany: (args: unknown) => Promise<unknown[]>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  agentActivity: {
    create: (args: unknown) => Promise<unknown>;
  };
};

const db = prisma as unknown as PrismaMock;
const originalFindMany = db.agent.findMany;
const originalUpdateMany = db.agent.updateMany;
const originalActivityCreate = db.agentActivity.create;
const originalEnv = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  // Mock prisma so scanner does not hit real database
  db.agent.findMany = async () => [];
  db.agent.updateMany = async () => ({ count: 0 });
  db.agentActivity.create = async () => ({});
});

afterEach(() => {
  resetAgentStatusTimeoutForTest();
  db.agent.findMany = originalFindMany;
  db.agent.updateMany = originalUpdateMany;
  db.agentActivity.create = originalActivityCreate;
  if (originalEnv !== undefined) {
    process.env.CRON_SECRET = originalEnv;
  } else {
    delete process.env.CRON_SECRET;
  }
});

test("rejects request without Authorization header", async () => {
  const request = createRouteRequest(
    "http://localhost/api/cron/agent-status-timeout",
    { method: "POST" }
  );
  const response = await POST(request);

  assert.equal(response.status, 401);
});

test("rejects request with wrong secret", async () => {
  const request = createRouteRequest(
    "http://localhost/api/cron/agent-status-timeout",
    { method: "POST", apiKey: "wrong-secret" }
  );
  const response = await POST(request);

  assert.equal(response.status, 401);
});

test("accepts request with correct CRON_SECRET", async () => {
  const request = createRouteRequest(
    "http://localhost/api/cron/agent-status-timeout",
    { method: "POST", apiKey: "test-cron-secret" }
  );
  const response = await POST(request);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(typeof body.data.timedOutCount, "number");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/app/api/cron/agent-status-timeout/route.test.ts`
Expected: FAIL — module `./route` not found

- [ ] **Step 3: Write the route handler**

Create `src/app/api/cron/agent-status-timeout/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { scanExpiredAgentStatuses } from "@/lib/agent-status-timeout";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const timedOutCount = await scanExpiredAgentStatuses();

    return Response.json({
      success: true,
      data: { timedOutCount },
    });
  } catch (err) {
    console.error("[cron/agent-status-timeout]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/app/api/cron/agent-status-timeout/route.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/agent-status-timeout/
git commit -m "feat: add cron endpoint for manual agent status timeout trigger"
```
