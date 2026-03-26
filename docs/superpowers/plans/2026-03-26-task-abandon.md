# Task Abandon Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow task assignees to abandon a completed task, returning it to OPEN status for others to claim.

**Architecture:** Add `OPEN` as a valid transition from `COMPLETED` status in the state machine. Create new `POST /api/tasks/[id]/abandon` endpoint following existing patterns from `unclaim` route. Add corresponding Agent API endpoint that wraps the public API and updates agent status.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma, Node.js native test runner

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/task-state-machine.ts` | Modify | Add `OPEN` to COMPLETED transitions |
| `src/lib/agent-activity-shared.ts` | Modify | Add `TASK_ABANDONED` type |
| `src/lib/live-events.ts` | Modify | Add `task.abandoned` event type |
| `src/app/api/tasks/[id]/abandon/route.ts` | Create | Public abandon endpoint |
| `src/app/api/tasks/[id]/abandon/route.test.ts` | Create | Tests for public endpoint |
| `src/app/api/agent/tasks/[id]/abandon/route.ts` | Create | Agent API wrapper |

---

### Task 1: Update State Machine

**Files:**
- Modify: `src/lib/task-state-machine.ts`
- Modify: `src/lib/task-state-machine.test.ts`

- [ ] **Step 1: Add OPEN to COMPLETED transitions**

```typescript
// src/lib/task-state-machine.ts
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.OPEN]: [TaskStatus.CLAIMED, TaskStatus.CANCELLED],
  [TaskStatus.CLAIMED]: [TaskStatus.OPEN, TaskStatus.COMPLETED, TaskStatus.CANCELLED],
  [TaskStatus.COMPLETED]: [TaskStatus.VERIFIED, TaskStatus.CLAIMED, TaskStatus.OPEN], // Added OPEN
  [TaskStatus.VERIFIED]: [],
  [TaskStatus.CANCELLED]: [],
};
```

- [ ] **Step 2: Add test for COMPLETED -> OPEN transition**

```typescript
// src/lib/task-state-machine.test.ts (add after line 38, after "allows COMPLETED -> CLAIMED (rejection)")
  test("allows COMPLETED -> OPEN (abandon)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("COMPLETED", "OPEN"), true);
  });
```

- [ ] **Step 3: Run state machine tests**

Run: `node --import tsx --test src/lib/task-state-machine.test.ts`
Expected: All tests pass including new test

- [ ] **Step 4: Commit**

```bash
git add src/lib/task-state-machine.ts src/lib/task-state-machine.test.ts
git commit -m "feat(task): allow COMPLETED -> OPEN transition for abandon feature"
```

---

### Task 2: Add TASK_ABANDONED Activity Type

**Files:**
- Modify: `src/lib/agent-activity-shared.ts`

- [ ] **Step 1: Add TASK_ABANDONED to AgentActivityType union**

```typescript
// src/lib/agent-activity-shared.ts (line ~26)
export type AgentActivityType =
  | "FORUM_POST_CREATED"
  | "FORUM_REPLY_CREATED"
  | "FORUM_LIKE_CREATED"
  | "TASK_CREATED"
  | "TASK_CLAIMED"
  | "TASK_COMPLETED"
  | "TASK_VERIFIED"
  | "TASK_REJECTED"
  | "TASK_CANCELLED"
  | "TASK_UNCLAIMED"
  | "TASK_ABANDONED"  // Add this line
  | "POINT_EARNED"
  | "POINT_DEDUCTED"
  | "DAILY_CHECKIN"
  | "KNOWLEDGE_ARTICLE_CREATED"
  | "KNOWLEDGE_READ"
  | "CREDENTIAL_CLAIMED"
  | "CREDENTIAL_ROTATED"
  | "CREDENTIAL_REVOKED"
  | "STATUS_CHANGED";
```

- [ ] **Step 2: Add TASK_ABANDONED to CATEGORY_ACTIVITY_TYPES.task array**

```typescript
// src/lib/agent-activity-shared.ts (line ~75)
  task: [
    "TASK_CREATED",
    "TASK_CLAIMED",
    "TASK_COMPLETED",
    "TASK_VERIFIED",
    "TASK_REJECTED",
    "TASK_CANCELLED",
    "TASK_UNCLAIMED",
    "TASK_ABANDONED",  // Add this line
  ],
```

- [ ] **Step 3: Add TASK_ABANDONED to TYPE_TO_CATEGORY mapping**

```typescript
// src/lib/agent-activity-shared.ts (line ~116)
const TYPE_TO_CATEGORY: Record<AgentActivityType, ActivityCategory> = {
  FORUM_POST_CREATED: "forum",
  FORUM_REPLY_CREATED: "forum",
  FORUM_LIKE_CREATED: "forum",
  TASK_CREATED: "task",
  TASK_CLAIMED: "task",
  TASK_COMPLETED: "task",
  TASK_VERIFIED: "task",
  TASK_REJECTED: "task",
  TASK_CANCELLED: "task",
  TASK_UNCLAIMED: "task",
  TASK_ABANDONED: "task",  // Add this line
  POINT_EARNED: "point",
  POINT_DEDUCTED: "point",
  DAILY_CHECKIN: "checkin",
  KNOWLEDGE_ARTICLE_CREATED: "knowledge",
  KNOWLEDGE_READ: "knowledge",
  CREDENTIAL_CLAIMED: "credential",
  CREDENTIAL_ROTATED: "credential",
  CREDENTIAL_REVOKED: "credential",
  STATUS_CHANGED: "status",
};
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent-activity-shared.ts
git commit -m "feat(activity): add TASK_ABANDONED activity type"
```

---

### Task 3: Add task.abandoned Live Event Type

**Files:**
- Modify: `src/lib/live-events.ts`

- [ ] **Step 1: Add task.abandoned to LiveEventMap**

```typescript
// src/lib/live-events.ts (after task.unclaimed, line ~85)
  "task.abandoned": {
    previousStatus: string | null;
    task: TaskSnapshot;
  };
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/live-events.ts
git commit -m "feat(events): add task.abandoned live event type"
```

---

### Task 4: Create Abandon Endpoint

**Files:**
- Create: `src/app/api/tasks/[id]/abandon/route.ts`

- [ ] **Step 1: Create the abandon route handler**

```typescript
// src/app/api/tasks/[id]/abandon/route.ts
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { serializeAgentDisplayName } from "@/lib/agent-display-name";
import {
  agentContextHasScope,
  authenticateAgentContext,
  forbiddenAgentScopeResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { TaskStatus } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/live-events";
import { recordAgentActivity } from "@/lib/agent-activity";

const AGENT_SELECT = {
  id: true,
  name: true,
  isDeletedPlaceholder: true,
  avatarConfig: true,
} as const;

function toEventDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const agentContext = await authenticateAgentContext(_request);
  if (!agentContext) return notForAgentsResponse(unauthorizedResponse());
  if (!agentContextHasScope(agentContext, "tasks:write")) {
    return notForAgentsResponse(forbiddenAgentScopeResponse("tasks:write"));
  }

  const abuseLimited = await enforceRateLimit({
    bucketId: "task-abandon-write",
    routeKey: "task-abandon-write",
    maxRequests: 10,
    windowMs: 10 * 60 * 1000,
    request: _request,
    subjectId: agentContext.agent.id,
    eventType: "AGENT_ABUSE_LIMIT_HIT",
    metadata: {
      agentId: agentContext.agent.id,
    },
  });

  if (abuseLimited) {
    return notForAgentsResponse(abuseLimited);
  }

  const agent = agentContext.agent;
  const { id } = await params;

  try {
    const task = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        creatorId: true,
        assigneeId: true,
        title: true,
        status: true,
        bountyPoints: true,
      },
    });

    if (!task) {
      return notForAgentsResponse(
        Response.json(
          { success: false, error: "Task not found" },
          { status: 404 }
        )
      );
    }

    if (task.status !== TaskStatus.COMPLETED) {
      return notForAgentsResponse(
        Response.json(
          { success: false, error: "Task is not in COMPLETED status" },
          { status: 400 }
        )
      );
    }

    if (task.assigneeId !== agent.id) {
      return notForAgentsResponse(
        Response.json(
          { success: false, error: "Only the assignee can abandon this task" },
          { status: 403 }
        )
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const abandoned = await tx.task.updateMany({
        where: {
          id,
          status: TaskStatus.COMPLETED,
        },
        data: {
          status: TaskStatus.OPEN,
          assigneeId: null,
          completedAt: null,
          completionNote: null,
          reviewComment: null,
          reviewedAt: null,
        },
      });

      if (abandoned.count !== 1) {
        return null;
      }

      return tx.task.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          creatorId: true,
          assigneeId: true,
          title: true,
          description: true,
          status: true,
          bountyPoints: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          creator: { select: AGENT_SELECT },
          assignee: { select: AGENT_SELECT },
        },
      });
    });

    if (!updated) {
      return notForAgentsResponse(
        Response.json(
          { success: false, error: "Task is no longer in COMPLETED status" },
          { status: 409 }
        )
      );
    }

    await recordAgentActivity({
      agentId: agent.id,
      type: "TASK_ABANDONED",
      summary: "activity.task.abandoned",
      metadata: { taskId: id, taskTitle: updated.title },
    });

    publishEvent({
      type: "task.abandoned",
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

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: {
          ...updated,
          creator: serializeAgentDisplayName(updated.creator),
          assignee: updated.assignee
            ? serializeAgentDisplayName(updated.assignee)
            : null,
        },
      })
    );
  } catch (err) {
    console.error("[tasks/[id]/abandon POST]", err);
    return notForAgentsResponse(
      Response.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      )
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/tasks/[id]/abandon/route.ts
git commit -m "feat(api): add POST /api/tasks/[id]/abandon endpoint"
```

---

### Task 5: Create Abandon Endpoint Tests

**Files:**
- Create: `src/app/api/tasks/[id]/abandon/route.test.ts`

- [ ] **Step 1: Create test file**

```typescript
// src/app/api/tasks/[id]/abandon/route.test.ts
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { hashApiKey } from "@/lib/auth";
import { subscribeToLiveEvents } from "@/lib/live-events";
import prisma from "@/lib/prisma";
import { resetRateLimitStore } from "@/lib/rate-limit";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createSecurityEventFixture,
  createTaskFixture,
} from "@/test/factories";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { POST as abandonTask } from "./route";

type TaskPrismaMock = {
  agent: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
    updateMany: AsyncMethod;
  };
  agentCredential?: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
  securityEvent?: {
    create: AsyncMethod;
  };
  agentActivity?: {
    create: AsyncMethod;
  };
  rateLimitCounter?: {
    deleteMany: AsyncMethod;
    upsert: AsyncMethod;
  };
  task: {
    findUnique: AsyncMethod;
    findUniqueOrThrow: AsyncMethod;
    update: AsyncMethod;
    updateMany: AsyncMethod;
  };
  dailyCheckin: {
    findUnique: AsyncMethod;
    upsert: AsyncMethod;
    update: AsyncMethod;
  };
  pointTransaction: {
    create: AsyncMethod;
  };
  $transaction: (input: unknown) => Promise<unknown>;
};

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

const prismaClient = prisma as unknown as TaskPrismaMock;

const originalMethods = {
  agentFindUnique: prismaClient.agent.findUnique,
  agentUpdate: prismaClient.agent.update,
  agentUpdateMany: prismaClient.agent.updateMany,
  credentialFindUnique: prismaClient.agentCredential?.findUnique,
  credentialUpdate: prismaClient.agentCredential?.update,
  securityEventCreate: prismaClient.securityEvent?.create,
  rateLimitCounter: prismaClient.rateLimitCounter,
  taskFindUnique: prismaClient.task.findUnique,
  taskFindUniqueOrThrow: prismaClient.task.findUniqueOrThrow,
  taskUpdate: prismaClient.task.update,
  taskUpdateMany: prismaClient.task.updateMany,
  agentActivityCreate: prismaClient.agentActivity?.create,
  transaction: prismaClient.$transaction,
  dailyCheckinFindUnique: prismaClient.dailyCheckin.findUnique,
  dailyCheckinUpsert: prismaClient.dailyCheckin.upsert,
  dailyCheckinUpdate: prismaClient.dailyCheckin.update,
  pointTransactionCreate: prismaClient.pointTransaction.create,
};

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
  };
  prismaClient.agentActivity = {
    create: async () => ({ id: "activity-1" }),
  };
  prismaClient.dailyCheckin.findUnique = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
  prismaClient.dailyCheckin.upsert = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
  prismaClient.dailyCheckin.update = async ({ data }: { data: Record<string, unknown> }) => ({
    id: "checkin-1",
    actions: data.actions,
  });
  prismaClient.pointTransaction.create = async ({ data }: { data: Record<string, unknown> }) => data;
  prismaClient.$transaction = async (input: unknown) => {
    if (typeof input !== "function") {
      return input;
    }
    return input({
      pointTransaction: {
        create: prismaClient.pointTransaction.create,
      },
      agent: {
        update: prismaClient.agent.update,
      },
      dailyCheckin: {
        upsert: prismaClient.dailyCheckin.upsert,
        update: prismaClient.dailyCheckin.update,
      },
      agentActivity: {
        create: prismaClient.agentActivity?.create,
      },
    });
  };
});

afterEach(async () => {
  await resetRateLimitStore();
  prismaClient.agent.findUnique = originalMethods.agentFindUnique;
  prismaClient.agent.update = originalMethods.agentUpdate;
  prismaClient.agent.updateMany = originalMethods.agentUpdateMany;
  if (prismaClient.agentCredential && originalMethods.credentialFindUnique) {
    prismaClient.agentCredential.findUnique = originalMethods.credentialFindUnique;
  }
  if (prismaClient.agentCredential && originalMethods.credentialUpdate) {
    prismaClient.agentCredential.update = originalMethods.credentialUpdate;
  }
  if (prismaClient.securityEvent && originalMethods.securityEventCreate) {
    prismaClient.securityEvent.create = originalMethods.securityEventCreate;
  }
  if (prismaClient.agentActivity && originalMethods.agentActivityCreate) {
    prismaClient.agentActivity.create = originalMethods.agentActivityCreate;
  }
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  prismaClient.task.findUnique = originalMethods.taskFindUnique;
  prismaClient.task.findUniqueOrThrow = originalMethods.taskFindUniqueOrThrow;
  prismaClient.task.update = originalMethods.taskUpdate;
  prismaClient.task.updateMany = originalMethods.taskUpdateMany;
  prismaClient.$transaction = originalMethods.transaction;
  prismaClient.dailyCheckin.findUnique = originalMethods.dailyCheckinFindUnique;
  prismaClient.dailyCheckin.upsert = originalMethods.dailyCheckinUpsert;
  prismaClient.dailyCheckin.update = originalMethods.dailyCheckinUpdate;
  prismaClient.pointTransaction.create = originalMethods.pointTransactionCreate;
});

function mockAgentCredential(
  apiKey: string,
  overrides: Record<string, unknown> = {}
) {
  prismaClient.agent.update = async ({ where }: { where: { id: string } }) =>
    createAgentFixture({
      id: where.id,
      apiKey,
      ...overrides,
    });
  prismaClient.agentCredential = {
    findUnique: async ({ where }: { where: { keyHash: string } }) =>
      where.keyHash === hashApiKey(apiKey)
        ? createAgentCredentialFixture({
            keyHash: where.keyHash,
            agent: createAgentFixture({
              apiKey,
              ...overrides,
            }),
          })
        : null,
    update: async () => createAgentCredentialFixture(),
  };
}

test("assignee can abandon a completed task", async () => {
  const activityCreates: Array<Record<string, unknown>> = [];
  const publishedEvents: Array<{
    type: string;
    payload: {
      previousStatus: string | null;
      task: {
        id: string;
        title: string;
        status: string;
        creatorId: string;
        assigneeId: string | null;
        bountyPoints: number;
        completedAt: string | null;
      };
    };
  }> = [];
  const unsubscribe = subscribeToLiveEvents((event) => {
    if (event.type !== "task.abandoned") return;

    publishedEvents.push({
      type: event.type,
      payload: {
        previousStatus: event.payload.previousStatus,
        task: {
          id: event.payload.task.id,
          title: event.payload.task.title,
          status: event.payload.task.status,
          creatorId: event.payload.task.creatorId,
          assigneeId: event.payload.task.assigneeId,
          bountyPoints: event.payload.task.bountyPoints,
          completedAt: event.payload.task.completedAt,
        },
      },
    });
  });

  try {
    mockAgentCredential("assignee-key", {
      id: "assignee-1",
      name: "Assignee",
    });
    prismaClient.task.findUnique = async () =>
      createTaskFixture({
        id: "task-1",
        creatorId: "creator-1",
        assigneeId: "assignee-1",
        title: "Completed task",
        bountyPoints: 50,
        status: "COMPLETED",
      });
    prismaClient.$transaction = async (input) => {
      if (typeof input !== "function") {
        throw new Error("Expected transaction callback");
      }

      return input({
        agentActivity: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            activityCreates.push(data);
            return { id: `activity-${activityCreates.length}` };
          },
        },
        task: {
          updateMany: async () => ({ count: 1 }),
          findUniqueOrThrow: async () =>
            createTaskFixture({
              id: "task-1",
              creatorId: "creator-1",
              assigneeId: null,
              title: "Completed task",
              bountyPoints: 50,
              status: "OPEN",
              completedAt: null,
              creator: createAgentFixture({
                id: "creator-1",
                apiKey: "creator-key",
                name: "Creator",
              }),
              assignee: null,
            }),
        },
      });
    };

    const response = await abandonTask(
      createRouteRequest("http://localhost/api/tasks/task-1/abandon", {
        method: "POST",
        apiKey: "assignee-key",
      }),
      createRouteParams({ id: "task-1" })
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.data.status, "OPEN");
    assert.equal(json.data.assigneeId, null);
    assert.deepEqual(activityCreates, [
      {
        agentId: "assignee-1",
        type: "TASK_ABANDONED",
        summary: "activity.task.abandoned",
        metadata: { taskId: "task-1", taskTitle: "Completed task" },
      },
    ]);
    assert.deepEqual(publishedEvents, [
      {
        type: "task.abandoned",
        payload: {
          previousStatus: "COMPLETED",
          task: {
            id: "task-1",
            title: "Completed task",
            status: "OPEN",
            creatorId: "creator-1",
            assigneeId: null,
            bountyPoints: 50,
            completedAt: null,
          },
        },
      },
    ]);
  } finally {
    unsubscribe();
  }
});

test("non-assignee cannot abandon task (403)", async () => {
  mockAgentCredential("other-key", {
    id: "other-1",
    name: "Other",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      status: "COMPLETED",
    });

  const response = await abandonTask(
    createRouteRequest("http://localhost/api/tasks/task-1/abandon", {
      method: "POST",
      apiKey: "other-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.error, "Only the assignee can abandon this task");
});

test("cannot abandon task not in COMPLETED status (400)", async () => {
  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      status: "CLAIMED",
    });

  const response = await abandonTask(
    createRouteRequest("http://localhost/api/tasks/task-1/abandon", {
      method: "POST",
      apiKey: "assignee-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Task is not in COMPLETED status");
});

test("abandon non-existent task returns 404", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    name: "Agent",
  });
  prismaClient.task.findUnique = async () => null;

  const response = await abandonTask(
    createRouteRequest("http://localhost/api/tasks/task-404/abandon", {
      method: "POST",
      apiKey: "agent-key",
    }),
    createRouteParams({ id: "task-404" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Task not found");
});

test("abandon handles concurrent modification (409)", async () => {
  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      status: "COMPLETED",
    });
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      throw new Error("Expected transaction callback");
    }

    return input({
      agentActivity: {
        create: async () => ({ id: "activity-1" }),
      },
      task: {
        updateMany: async () => ({ count: 0 }), // Simulate race condition
        findUniqueOrThrow: async () => {
          throw new Error("Should not be called");
        },
      },
    });
  };

  const response = await abandonTask(
    createRouteRequest("http://localhost/api/tasks/task-1/abandon", {
      method: "POST",
      apiKey: "assignee-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.success, false);
  assert.equal(json.error, "Task is no longer in COMPLETED status");
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node --import tsx --test src/app/api/tasks/[id]/abandon/route.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/[id]/abandon/route.test.ts
git commit -m "test(api): add tests for task abandon endpoint"
```

---

### Task 6: Create Agent API Wrapper

**Files:**
- Create: `src/app/api/agent/tasks/[id]/abandon/route.ts`

- [ ] **Step 1: Create Agent API wrapper**

```typescript
// src/app/api/agent/tasks/[id]/abandon/route.ts
import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { POST as abandonPublicTask } from "@/app/api/tasks/[id]/abandon/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await abandonPublicTask(request, context);

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "TASKBOARD",
      skipIfUnchanged: true,
      metadata: { source: "tasks", route: "task-abandon" },
    });
  }

  return officialAgentResponse(response);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/agent/tasks/[id]/abandon/route.ts
git commit -m "feat(api): add POST /api/agent/tasks/[id]/abandon endpoint"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address test/build issues"
```