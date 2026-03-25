# Completion Note Edit 功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许 assignee 在任务处于 COMPLETED 状态时修改 completionNote。

**Architecture:** 新建 `PATCH /api/tasks/[id]/completion-note` 端点，Agent API 提供对应的 thin wrapper。遵循现有 complete route 的认证、限流、校验模式。

**Tech Stack:** Next.js App Router, Prisma, TypeScript, Node.js test runner

---

## File Structure

| File | Purpose |
|------|---------|
| `src/app/api/tasks/[id]/completion-note/route.ts` | PATCH handler，核心逻辑 |
| `src/app/api/agent/tasks/[id]/completion-note/route.ts` | Agent API thin wrapper |
| `src/app/api/tasks/task-lifecycle.test.ts` | 新增测试用例 |

---

### Task 1: Write failing tests for PATCH completion-note endpoint

**Files:**
- Modify: `src/app/api/tasks/task-lifecycle.test.ts`

- [ ] **Step 1: Add import for the new PATCH handler**

在文件顶部添加 import：

```typescript
import { PATCH as updateCompletionNote } from "./[id]/completion-note/route";
```

- [ ] **Step 2: Write test for successful update by assignee**

```typescript
test("PATCH completion-note updates completionNote when assignee requests it on COMPLETED task", async () => {
  let updateData: Record<string, unknown> | undefined;

  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      assigneeId: "assignee-1",
      status: "COMPLETED",
      completionNote: "Old note",
    });

  const taskFixture = createTaskFixture({
    id: "task-1",
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completionNote: "Updated note",
    creator: createAgentFixture({
      id: "creator-1",
      apiKey: "creator-key",
      name: "Creator",
    }),
    assignee: createAgentFixture({
      id: "assignee-1",
      apiKey: "assignee-key",
      name: "Assignee",
    }),
  });

  prismaClient.task.update = async ({ data }) => {
    updateData = data as Record<string, unknown>;
    return taskFixture;
  };

  const response = await updateCompletionNote(
    createRouteRequest("http://localhost/api/tasks/task-1/completion-note", {
      method: "PATCH",
      apiKey: "assignee-key",
      json: { completionNote: "Updated note" },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(updateData?.completionNote, "Updated note");
  assert.equal(json.data.completionNote, "Updated note");
});
```

- [ ] **Step 3: Write test for non-COMPLETED status rejection**

```typescript
test("PATCH completion-note rejects when task is not COMPLETED", async () => {
  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      assigneeId: "assignee-1",
      status: "CLAIMED",
    });

  const response = await updateCompletionNote(
    createRouteRequest("http://localhost/api/tasks/task-1/completion-note", {
      method: "PATCH",
      apiKey: "assignee-key",
      json: { completionNote: "Updated note" },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.ok(json.error.includes("COMPLETED"));
});
```

- [ ] **Step 4: Write test for non-assignee rejection**

```typescript
test("PATCH completion-note rejects when caller is not assignee", async () => {
  mockAgentCredential("other-key", {
    id: "other-1",
    name: "Other",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      assigneeId: "assignee-1",
      status: "COMPLETED",
    });

  const response = await updateCompletionNote(
    createRouteRequest("http://localhost/api/tasks/task-1/completion-note", {
      method: "PATCH",
      apiKey: "other-key",
      json: { completionNote: "Updated note" },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.ok(json.error.includes("assignee"));
});
```

- [ ] **Step 5: Write test for task not found**

```typescript
test("PATCH completion-note returns 404 when task not found", async () => {
  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
  });
  prismaClient.task.findUnique = async () => null;

  const response = await updateCompletionNote(
    createRouteRequest("http://localhost/api/tasks/task-1/completion-note", {
      method: "PATCH",
      apiKey: "assignee-key",
      json: { completionNote: "Updated note" },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.ok(json.error.includes("not found"));
});
```

- [ ] **Step 6: Write test for empty string stores as null**

```typescript
test("PATCH completion-note stores empty string as null", async () => {
  let updateData: Record<string, unknown> | undefined;

  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      assigneeId: "assignee-1",
      status: "COMPLETED",
      completionNote: "Old note",
    });

  const taskFixture = createTaskFixture({
    id: "task-1",
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completionNote: null,
  });

  prismaClient.task.update = async ({ data }) => {
    updateData = data as Record<string, unknown>;
    return taskFixture;
  };

  const response = await updateCompletionNote(
    createRouteRequest("http://localhost/api/tasks/task-1/completion-note", {
      method: "PATCH",
      apiKey: "assignee-key",
      json: { completionNote: "" },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(updateData?.completionNote, null);
});
```

- [ ] **Step 7: Write test for over 5000 characters rejection**

```typescript
test("PATCH completion-note rejects over 5000 characters", async () => {
  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      assigneeId: "assignee-1",
      status: "COMPLETED",
    });

  const longNote = "x".repeat(5001);

  const response = await updateCompletionNote(
    createRouteRequest("http://localhost/api/tasks/task-1/completion-note", {
      method: "PATCH",
      apiKey: "assignee-key",
      json: { completionNote: longNote },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.ok(json.error.includes("5000"));
});
```

- [ ] **Step 8: Write test for non-string type rejection**

```typescript
test("PATCH completion-note rejects non-string completionNote", async () => {
  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      assigneeId: "assignee-1",
      status: "COMPLETED",
    });

  const response = await updateCompletionNote(
    createRouteRequest("http://localhost/api/tasks/task-1/completion-note", {
      method: "PATCH",
      apiKey: "assignee-key",
      json: { completionNote: { invalid: "object" } },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.ok(json.error.includes("string"));
});
```

- [ ] **Step 9: Write test for missing tasks:write scope**

```typescript
test("PATCH completion-note rejects when agent lacks tasks:write scope", async () => {
  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
    scopes: ["forum:read"], // 缺少 tasks:write
  });

  const response = await updateCompletionNote(
    createRouteRequest("http://localhost/api/tasks/task-1/completion-note", {
      method: "PATCH",
      apiKey: "assignee-key",
      json: { completionNote: "Updated note" },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
});
```

- [ ] **Step 10: Write test for missing authentication**

```typescript
test("PATCH completion-note rejects when no authentication provided", async () => {
  const response = await updateCompletionNote(
    createRouteRequest("http://localhost/api/tasks/task-1/completion-note", {
      method: "PATCH",
      json: { completionNote: "Updated note" },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
});
```

- [ ] **Step 11: Run tests to verify they fail**

Run: `node --import tsx --test src/app/api/tasks/task-lifecycle.test.ts 2>&1 | grep -E "(PATCH completion-note|not ok|Error)" | head -20`

Expected: Tests fail with "Cannot find module" or similar import error.

- [ ] **Step 12: Commit failing tests**

```bash
git add src/app/api/tasks/task-lifecycle.test.ts
git commit -m "test: add failing tests for PATCH completion-note endpoint"
```

---

### Task 2: Implement PATCH /api/tasks/[id]/completion-note endpoint

**Files:**
- Create: `src/app/api/tasks/[id]/completion-note/route.ts`

- [ ] **Step 1: Create the route file with imports**

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

const COMPLETION_NOTE_MAX_LENGTH = 5000;

const AGENT_SELECT = {
  id: true,
  name: true,
  isDeletedPlaceholder: true,
  avatarConfig: true,
} as const;
```

- [ ] **Step 2: Implement PATCH handler**

```typescript
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. 认证 + scope 校验
  const agentContext = await authenticateAgentContext(request);
  if (!agentContext) return notForAgentsResponse(unauthorizedResponse());
  if (!agentContextHasScope(agentContext, "tasks:write")) {
    return notForAgentsResponse(forbiddenAgentScopeResponse("tasks:write"));
  }

  // 2. Rate limit
  const abuseLimited = await enforceRateLimit({
    bucketId: "task-completion-note-update",
    routeKey: "task-completion-note-update",
    maxRequests: 10,
    windowMs: 10 * 60 * 1000,
    request,
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

  // 3. 解析请求体
  const body = await request.json().catch(() => ({}));
  const completionNoteInput = body.completionNote;

  // 4. 校验 completionNote
  if (
    completionNoteInput !== undefined &&
    typeof completionNoteInput !== "string"
  ) {
    return notForAgentsResponse(Response.json(
      { success: false, error: "completionNote must be a string" },
      { status: 400 }
    ));
  }

  const trimmedCompletionNote =
    typeof completionNoteInput === "string" ? completionNoteInput.trim() : "";
  if (trimmedCompletionNote.length > COMPLETION_NOTE_MAX_LENGTH) {
    return notForAgentsResponse(Response.json(
      {
        success: false,
        error: `completionNote must be at most ${COMPLETION_NOTE_MAX_LENGTH} characters`,
      },
      { status: 400 }
    ));
  }

  const completionNote = trimmedCompletionNote.length > 0 ? trimmedCompletionNote : null;

  try {
    // 5. 查询任务，校验状态和 assignee
    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, assigneeId: true, status: true },
    });

    if (!task) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      ));
    }

    if (task.status !== TaskStatus.COMPLETED) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Can only update completionNote when task is COMPLETED" },
        { status: 400 }
      ));
    }

    if (task.assigneeId !== agent.id) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Only the assignee can update this task's completion note" },
        { status: 403 }
      ));
    }

    // 6. 更新 completionNote
    const updated = await prisma.task.update({
      where: { id },
      data: { completionNote },
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
        completionNote: true,
        reviewComment: true,
        reviewedAt: true,
        creator: { select: AGENT_SELECT },
        assignee: { select: AGENT_SELECT },
      },
    });

    // 7. 返回更新后的 task
    return notForAgentsResponse(Response.json({
      success: true,
      data: {
        ...updated,
        creator: serializeAgentDisplayName(updated.creator),
        assignee: updated.assignee ? serializeAgentDisplayName(updated.assignee) : null,
      },
    }));
  } catch (err) {
    console.error("[tasks/[id]/completion-note PATCH]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `node --import tsx --test src/app/api/tasks/task-lifecycle.test.ts 2>&1 | grep -E "(PATCH completion-note|ok|not ok)" | head -20`

Expected: All 10 new tests pass.

- [ ] **Step 4: Commit implementation**

```bash
git add src/app/api/tasks/[id]/completion-note/route.ts
git commit -m "feat: add PATCH /api/tasks/[id]/completion-note endpoint"
```

---

### Task 3: Create Agent API thin wrapper

**Files:**
- Create: `src/app/api/agent/tasks/[id]/completion-note/route.ts`

- [ ] **Step 1: Create the thin wrapper file**

```typescript
import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { PATCH as updateCompletionNotePublic } from "@/app/api/tasks/[id]/completion-note/route";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await updateCompletionNotePublic(request, context);

  return officialAgentResponse(response);
}
```

- [ ] **Step 2: Run full test suite**

Run: `npm test 2>&1 | tail -5`

Expected: All tests pass.

- [ ] **Step 3: Commit Agent API wrapper**

```bash
git add src/app/api/agent/tasks/[id]/completion-note/route.ts
git commit -m "feat: add Agent API wrapper for PATCH completion-note"
```

---

### Task 4: Verify and finalize

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: All tests pass (734+ tests).

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: No errors.

- [ ] **Step 3: Final verification commit if needed**

If any fixes were made:

```bash
git add -A
git commit -m "fix: address lint issues in completion-note endpoint"
```