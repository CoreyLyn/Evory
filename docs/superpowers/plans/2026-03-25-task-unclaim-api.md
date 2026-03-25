# Task Unclaim API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add API endpoint allowing Agents to abandon claimed tasks, transitioning status from CLAIMED back to OPEN.

**Architecture:** Dual-plane pattern — `/api/agent/tasks/[id]/unclaim` wraps shared logic in `/api/tasks/[id]/unclaim`. Uses Agent Bearer auth, validates assignee, records activity, publishes live event.

**Tech Stack:** Next.js App Router, Prisma, TypeScript, Node.js test runner

---

## Task 1: Add TASK_UNCLAIMED Activity Type

**Files:**
- Modify: `src/lib/agent-activity-shared.ts:7-25`
- Modify: `src/lib/agent-activity-shared.ts:74-81`
- Modify: `src/lib/agent-activity-shared.ts:114-133`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: Add TASK_UNCLAIMED to AgentActivityType union**

```typescript
// In src/lib/agent-activity-shared.ts line 16 (after TASK_CANCELLED)
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
  | "TASK_UNCLAIMED"  // Add this line
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

- [ ] **Step 2: Add TASK_UNCLAIMED to CATEGORY_ACTIVITY_TYPES.task array**

```typescript
// In src/lib/agent-activity-shared.ts line 74-81
  task: [
    "TASK_CREATED",
    "TASK_CLAIMED",
    "TASK_COMPLETED",
    "TASK_VERIFIED",
    "TASK_REJECTED",
    "TASK_CANCELLED",
    "TASK_UNCLAIMED",  // Add this line
  ],
```

- [ ] **Step 3: Add TASK_UNCLAIMED to TYPE_TO_CATEGORY mapping**

```typescript
// In src/lib/agent-activity-shared.ts after TASK_CANCELLED line
  TASK_CANCELLED: "task",
  TASK_UNCLAIMED: "task",  // Add this line
  POINT_EARNED: "point",
```

- [ ] **Step 4: Add i18n translations for activity.task.unclaimed**

```typescript
// In src/i18n/zh.ts after "activity.task.cancelled" line
  "activity.task.cancelled": "取消了任务",
  "activity.task.unclaimed": "放弃了任务",
```

```typescript
// In src/i18n/en.ts after "activity.task.cancelled" line
  "activity.task.cancelled": "Cancelled a task",
  "activity.task.unclaimed": "Unclaimed a task",
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-activity-shared.ts src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: add TASK_UNCLAIMED activity type with i18n translations"
```

---

## Task 2: Write Unclaim Route Tests

**Files:**
- Create: `src/app/api/tasks/[id]/unclaim/route.test.ts`

- [ ] **Step 1: Create test file with failing tests**

```typescript
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
import { POST as unclaimTask } from "./route";

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
};

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
  };
  prismaClient.agentActivity = {
    create: async () => ({ id: "activity-1" }),
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

test("assignee can unclaim a claimed task", async () => {
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
    if (event.type !== "task.unclaimed") return;

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
        title: "Claimed task",
        bountyPoints: 50,
        status: "CLAIMED",
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
              title: "Claimed task",
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

    const response = await unclaimTask(
      createRouteRequest("http://localhost/api/tasks/task-1/unclaim", {
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
        type: "TASK_UNCLAIMED",
        summary: "activity.task.unclaimed",
        metadata: { taskId: "task-1", taskTitle: "Claimed task" },
      },
    ]);
    assert.deepEqual(publishedEvents, [
      {
        type: "task.unclaimed",
        payload: {
          previousStatus: "CLAIMED",
          task: {
            id: "task-1",
            title: "Claimed task",
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

test("non-assignee cannot unclaim task (403)", async () => {
  mockAgentCredential("other-key", {
    id: "other-1",
    name: "Other",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      status: "CLAIMED",
    });

  const response = await unclaimTask(
    createRouteRequest("http://localhost/api/tasks/task-1/unclaim", {
      method: "POST",
      apiKey: "other-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.error, "Only the assignee can unclaim this task");
});

test("cannot unclaim task not in CLAIMED status (400)", async () => {
  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      status: "OPEN",
    });

  const response = await unclaimTask(
    createRouteRequest("http://localhost/api/tasks/task-1/unclaim", {
      method: "POST",
      apiKey: "assignee-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Task is not in CLAIMED status");
});

test("unclaim non-existent task returns 404", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    name: "Agent",
  });
  prismaClient.task.findUnique = async () => null;

  const response = await unclaimTask(
    createRouteRequest("http://localhost/api/tasks/task-404/unclaim", {
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

test("unclaim handles concurrent modification (409)", async () => {
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

  const response = await unclaimTask(
    createRouteRequest("http://localhost/api/tasks/task-1/unclaim", {
      method: "POST",
      apiKey: "assignee-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.success, false);
  assert.equal(json.error, "Task is no longer in CLAIMED status");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test src/app/api/tasks/[id]/unclaim/route.test.ts`
Expected: Tests fail because route does not exist

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/[id]/unclaim/route.test.ts
git commit -m "test: add failing tests for task unclaim route"
```

---

## Task 3: Implement Unclaim Route (Shared Logic)

**Files:**
- Create: `src/app/api/tasks/[id]/unclaim/route.ts`

- [ ] **Step 1: Create the unclaim route handler**

```typescript
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
    bucketId: "task-unclaim-write",
    routeKey: "task-unclaim-write",
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

    if (task.status !== TaskStatus.CLAIMED) {
      return notForAgentsResponse(
        Response.json(
          { success: false, error: "Task is not in CLAIMED status" },
          { status: 400 }
        )
      );
    }

    if (task.assigneeId !== agent.id) {
      return notForAgentsResponse(
        Response.json(
          { success: false, error: "Only the assignee can unclaim this task" },
          { status: 403 }
        )
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const unclaimed = await tx.task.updateMany({
        where: {
          id,
          status: TaskStatus.CLAIMED,
        },
        data: {
          status: TaskStatus.OPEN,
          assigneeId: null,
          completedAt: null,
          reviewComment: null,
          reviewedAt: null,
        },
      });

      if (unclaimed.count !== 1) {
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
          { success: false, error: "Task is no longer in CLAIMED status" },
          { status: 409 }
        )
      );
    }

    await recordAgentActivity({
      agentId: agent.id,
      type: "TASK_UNCLAIMED",
      summary: "activity.task.unclaimed",
      metadata: { taskId: id, taskTitle: updated.title },
    });

    publishEvent({
      type: "task.unclaimed",
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
    console.error("[tasks/[id]/unclaim POST]", err);
    return notForAgentsResponse(
      Response.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      )
    );
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node --import tsx --test src/app/api/tasks/[id]/unclaim/route.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/[id]/unclaim/route.ts
git commit -m "feat: implement task unclaim route (shared logic)"
```

---

## Task 4: Implement Agent API Wrapper

**Files:**
- Create: `src/app/api/agent/tasks/[id]/unclaim/route.ts`

- [ ] **Step 1: Create the Agent API wrapper**

```typescript
import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { POST as unclaimPublicTask } from "@/app/api/tasks/[id]/unclaim/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await unclaimPublicTask(request, context);

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "TASKBOARD",
      skipIfUnchanged: true,
      metadata: { source: "tasks", route: "task-unclaim" },
    });
  }

  return officialAgentResponse(response);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/agent/tasks/[id]/unclaim/route.ts
git commit -m "feat: add Agent API wrapper for task unclaim"
```

---

## Task 5: Run Full Test Suite

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Final commit (if needed)**

```bash
git status
# If any changes, commit with appropriate message
```