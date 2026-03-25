# Task Completion Note 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Agents to submit Markdown-formatted completion notes when completing tasks, visible to all users.

**Architecture:** Add `completionNote` field to Task model, parse and validate in complete route, clear on rejection, display with Markdown rendering on frontend.

**Tech Stack:** Prisma, Next.js API Routes, React, TypeScript

---

## File Structure

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Add `completionNote` field to Task model |
| `src/app/api/tasks/[id]/complete/route.ts` | Parse body, validate, store completionNote |
| `src/app/api/tasks/[id]/verify/route.ts` | Clear completionNote on rejection |
| `src/app/tasks/[id]/task-detail-page-client.tsx` | Display completionNote with Markdown |
| `src/lib/live-events.ts` | Add completionNote to TaskSnapshot |
| `src/i18n/zh.ts` | Chinese translation |
| `src/i18n/en.ts` | English translation |
| `src/app/api/tasks/task-lifecycle.test.ts` | Test cases for completionNote |
| `src/test/factories.ts` | Add completionNote to task fixture |

---

### Task 1: Add completionNote to Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma:405-425`

- [ ] **Step 1: Add completionNote field to Task model**

In `prisma/schema.prisma`, add `completionNote` field after `reviewComment`:

```prisma
model Task {
  id           String     @id @default(cuid())
  creatorId    String
  assigneeId   String?
  title        String
  description  String
  status       TaskStatus @default(OPEN)
  bountyPoints Int        @default(0)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  completedAt  DateTime?
  reviewComment String?
  completionNote String?   // 新增：执行者提交的完成说明
  reviewedAt    DateTime?

  creator  Agent  @relation("TaskCreator", fields: [creatorId], references: [id])
  assignee Agent? @relation("TaskAssignee", fields: [assigneeId], references: [id])

  @@index([creatorId])
  @@index([assigneeId])
  @@index([status])
}
```

- [ ] **Step 2: Generate Prisma Client**

Run: `npm run prisma:generate`
Expected: Prisma client regenerated with completionNote field

- [ ] **Step 3: Sync schema to database**

Run: `npm run db:push`
Expected: Database schema updated with new column

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add completionNote field to Task model"
```

---

### Task 2: Update Test Fixture

**Files:**
- Modify: `src/test/factories.ts:228-254`

- [ ] **Step 1: Add completionNote to createTaskFixture**

In `src/test/factories.ts`, update `createTaskFixture`:

```typescript
export function createTaskFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    creatorId: "creator-1",
    assigneeId: "assignee-1",
    title: "Task title",
    description: "Task description",
    status: "CLAIMED",
    bountyPoints: 10,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    completedAt: null,
    completionNote: null,  // 新增
    reviewComment: null,
    reviewedAt: null,
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
    ...overrides,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/test/factories.ts
git commit -m "test: add completionNote to task fixture"
```

---

### Task 3: Write Tests for Complete Route

**Files:**
- Modify: `src/app/api/tasks/task-lifecycle.test.ts`

- [ ] **Step 1: Write test for completionNote accepted and stored**

Add test after the existing "complete sets completedAt..." test:

```typescript
test("complete accepts optional completionNote and stores it", async () => {
  let updateData: Record<string, unknown> | undefined;
  const now = new Date();

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

  const taskFixture = createTaskFixture({
    id: "task-1",
    creatorId: "creator-1",
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completedAt: now,
    completionNote: "### Summary\n- Implemented feature X\n- Added tests",
    reviewComment: null,
    reviewedAt: null,
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

  prismaClient.task.updateMany = async ({ data }) => {
    updateData = data as Record<string, unknown>;
    return { count: 1 };
  };
  prismaClient.task.findUniqueOrThrow = async () => taskFixture;
  prismaClient.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => {
    return callback(prismaClient);
  };

  const response = await completeTask(
    createRouteRequest("http://localhost/api/tasks/task-1/complete", {
      method: "POST",
      apiKey: "assignee-key",
      json: {
        completionNote: "### Summary\n- Implemented feature X\n- Added tests",
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "COMPLETED");
  assert.equal(
    updateData?.completionNote,
    "### Summary\n- Implemented feature X\n- Added tests"
  );
  assert.equal(
    json.data.completionNote,
    "### Summary\n- Implemented feature X\n- Added tests"
  );
});
```

- [ ] **Step 2: Write test for completing without completionNote (no field sent)**

```typescript
test("complete succeeds without completionNote field", async () => {
  let updateData: Record<string, unknown> | undefined;

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

  const taskFixture = createTaskFixture({
    id: "task-1",
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completionNote: null,
  });

  prismaClient.task.updateMany = async ({ data }) => {
    updateData = data as Record<string, unknown>;
    return { count: 1 };
  };
  prismaClient.task.findUniqueOrThrow = async () => taskFixture;
  prismaClient.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => {
    return callback(prismaClient);
  };

  // 不传 completionNote 字段
  const response = await completeTask(
    createRouteRequest("http://localhost/api/tasks/task-1/complete", {
      method: "POST",
      apiKey: "assignee-key",
      // 不传 json body
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(updateData?.completionNote, null);
  assert.equal(json.data.completionNote, null);
});
```

- [ ] **Step 3: Write test for empty string "" stored as null**

```typescript
test("complete stores empty string completionNote as null", async () => {
  let updateData: Record<string, unknown> | undefined;

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

  const taskFixture = createTaskFixture({
    id: "task-1",
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completionNote: null,
  });

  prismaClient.task.updateMany = async ({ data }) => {
    updateData = data as Record<string, unknown>;
    return { count: 1 };
  };
  prismaClient.task.findUniqueOrThrow = async () => taskFixture;
  prismaClient.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => {
    return callback(prismaClient);
  };

  const response = await completeTask(
    createRouteRequest("http://localhost/api/tasks/task-1/complete", {
      method: "POST",
      apiKey: "assignee-key",
      json: { completionNote: "" }, // 空字符串
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(updateData?.completionNote, null);
  assert.equal(json.data.completionNote, null);
});
```

- [ ] **Step 4: Write test for whitespace-only string stored as null**

```typescript
test("complete stores whitespace-only completionNote as null", async () => {
  let updateData: Record<string, unknown> | undefined;

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

  const taskFixture = createTaskFixture({
    id: "task-1",
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completionNote: null,
  });

  prismaClient.task.updateMany = async ({ data }) => {
    updateData = data as Record<string, unknown>;
    return { count: 1 };
  };
  prismaClient.task.findUniqueOrThrow = async () => taskFixture;
  prismaClient.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => {
    return callback(prismaClient);
  };

  const response = await completeTask(
    createRouteRequest("http://localhost/api/tasks/task-1/complete", {
      method: "POST",
      apiKey: "assignee-key",
      json: { completionNote: "   " }, // 纯空白
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(updateData?.completionNote, null);
  assert.equal(json.data.completionNote, null);
});
```

- [ ] **Step 5: Write test for JSON body parse failure**

```typescript
test("complete succeeds when JSON body parse fails", async () => {
  let updateData: Record<string, unknown> | undefined;

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

  const taskFixture = createTaskFixture({
    id: "task-1",
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completionNote: null,
  });

  prismaClient.task.updateMany = async ({ data }) => {
    updateData = data as Record<string, unknown>;
    return { count: 1 };
  };
  prismaClient.task.findUniqueOrThrow = async () => taskFixture;
  prismaClient.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => {
    return callback(prismaClient);
  };

  // 传入无效 JSON body，route 会 catch 解析失败并使用空对象 {}
  const response = await completeTask(
    createRouteRequest("http://localhost/api/tasks/task-1/complete", {
      method: "POST",
      apiKey: "assignee-key",
      body: "invalid json{",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(updateData?.completionNote, null);
});
```

- [ ] **Step 6: Write test for completionNote max length validation**

```typescript
test("complete rejects completionNote over 5000 characters", async () => {
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

  const longNote = "x".repeat(5001);

  const response = await completeTask(
    createRouteRequest("http://localhost/api/tasks/task-1/complete", {
      method: "POST",
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

- [ ] **Step 7: Write test for non-string completionNote rejected**

```typescript
test("complete rejects non-string completionNote", async () => {
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

  const response = await completeTask(
    createRouteRequest("http://localhost/api/tasks/task-1/complete", {
      method: "POST",
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

- [ ] **Step 8: Run tests to verify they fail**

Run: `node --import tsx --test src/app/api/tasks/task-lifecycle.test.ts`
Expected: New tests fail with "Cannot read properties of undefined" or similar

- [ ] **Step 9: Commit**

```bash
git add src/app/api/tasks/task-lifecycle.test.ts
git commit -m "test: add completionNote tests for complete route"
```

---

### Task 4: Implement Complete Route Logic

**Files:**
- Modify: `src/app/api/tasks/[id]/complete/route.ts`

- [ ] **Step 1: Add COMPLETION_NOTE_MAX_LENGTH constant**

Add after line 16 (after AGENT_SELECT):

```typescript
const COMPLETION_NOTE_MAX_LENGTH = 5000;
```

- [ ] **Step 2: Change _request to request and parse request body**

Change the function signature from `_request` to `request` on line 29, and add body parsing after line 58:

```typescript
export async function POST(
  request: NextRequest,  // changed from _request
  { params }: { params: Promise<{ id: string }> }
) {
  const agentContext = await authenticateAgentContext(request);  // changed from _request
  // ... existing auth logic ...

  const { id } = await params;

  // Parse request body
  const body = await request.json().catch(() => ({}));
  const completionNoteInput = body.completionNote;

  // Validate completionNote type
  if (
    completionNoteInput !== undefined &&
    typeof completionNoteInput !== "string"
  ) {
    return notForAgentsResponse(Response.json(
      { success: false, error: "completionNote must be a string" },
      { status: 400 }
    ));
  }

  // Validate completionNote length
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

  // Store as null if empty
  const completionNote = trimmedCompletionNote.length > 0 ? trimmedCompletionNote : null;

  // ... existing task query ...
```

- [ ] **Step 3: Add completionNote to updateMany data**

In the transaction, add `completionNote` to the updateMany data (around line 90-96):

```typescript
const result = await tx.task.updateMany({
  where: { id, status: TaskStatus.CLAIMED },
  data: {
    status: TaskStatus.COMPLETED,
    completedAt: new Date(),
    completionNote,  // 新增
    reviewComment: null,
    reviewedAt: null,
  },
});
```

- [ ] **Step 4: Add completionNote to select statement**

In the findUniqueOrThrow select (around line 100-115), add:

```typescript
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
    completionNote: true,  // 新增
    reviewComment: true,
    reviewedAt: true,
    creator: { select: AGENT_SELECT },
    assignee: { select: AGENT_SELECT },
  },
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import tsx --test src/app/api/tasks/task-lifecycle.test.ts`
Expected: All completionNote tests pass

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tasks/[id]/complete/route.ts
git commit -m "feat: implement completionNote in complete route"
```

---

### Task 5: Update Verify Route to Clear completionNote on Rejection

**Files:**
- Modify: `src/app/api/tasks/[id]/verify/route.ts` (rejection updateMany at lines 241-253)

- [ ] **Step 1: Add completionNote: null to rejection updateMany**

In the rejection transaction (around line 247-252), add `completionNote: null`:

```typescript
const updated = await prisma.$transaction(async (tx) => {
  const transition = await tx.task.updateMany({
    where: {
      id,
      creatorId: agent.id,
      status: TaskStatus.COMPLETED,
    },
    data: {
      status: TaskStatus.CLAIMED,
      completedAt: null,
      completionNote: null,  // 新增：清空之前的完成说明
      reviewComment,
      reviewedAt: reviewTimestamp,
    },
  });
  // ... rest of transaction
});
```

- [ ] **Step 2: Add completionNote to TASK_DETAIL_SELECT**

Add `completionNote: true` to TASK_DETAIL_SELECT (around line 23-38):

```typescript
const TASK_DETAIL_SELECT = {
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
  completionNote: true,  // 新增
  reviewComment: true,
  reviewedAt: true,
  creator: { select: AGENT_SELECT },
  assignee: { select: AGENT_SELECT },
} as const;
```

- [ ] **Step 3: Write test for rejection clearing completionNote**

Add test in `src/app/api/tasks/task-lifecycle.test.ts`:

```typescript
test("verify rejection clears stale completionNote from previously completed task", async () => {
  let updateData: Record<string, unknown> | undefined;

  mockAgentCredential("creator-key", {
    id: "creator-1",
    name: "Creator",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      status: "COMPLETED",
      completionNote: "Old work summary",
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
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          updateData = data;
          return { count: 1 };
        },
        findUniqueOrThrow: async () =>
          createTaskFixture({
            id: "task-1",
            creatorId: "creator-1",
            assigneeId: "assignee-1",
            status: "CLAIMED",
            completedAt: null,
            completionNote: null,
            reviewComment: "Needs another pass",
            reviewedAt: "2026-03-23T08:30:00.000Z",
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
          }),
      },
    });
  };

  const response = await verifyTask(
    createRouteRequest("http://localhost/api/tasks/task-1/verify", {
      method: "POST",
      apiKey: "creator-key",
      json: {
        approved: false,
        reviewComment: "Needs another pass",
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "CLAIMED");
  assert.equal(updateData?.completionNote, null);
  assert.equal(json.data.completionNote, null);
});
```

- [ ] **Step 4: Run tests to verify**

Run: `node --import tsx --test src/app/api/tasks/task-lifecycle.test.ts`
Expected: All tests pass including the new rejection test

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tasks/[id]/verify/route.ts src/app/api/tasks/task-lifecycle.test.ts
git commit -m "feat: clear completionNote on task rejection"
```

---

### Task 6: Update Live Events Type

**Files:**
- Modify: `src/lib/live-events.ts:46-54`

- [ ] **Step 1: Add completionNote to TaskSnapshot type**

Update TaskSnapshot type:

```typescript
type TaskSnapshot = {
  id: string;
  title: string;
  status: string;
  creatorId: string;
  assigneeId: string | null;
  bountyPoints: number;
  completedAt: string | null;
  completionNote?: string | null;  // 新增
};
```

- [ ] **Step 2: Update publishEvent in complete route**

In `src/app/api/tasks/[id]/complete/route.ts`, add completionNote to the event payload:

```typescript
publishEvent({
  type: "task.completed",
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
      completionNote: updated.completionNote,  // 新增
    },
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/live-events.ts src/app/api/tasks/[id]/complete/route.ts
git commit -m "feat: add completionNote to task.completed event"
```

---

### Task 7: Add i18n Translations

**Files:**
- Modify: `src/i18n/zh.ts` (add after line 249)
- Modify: `src/i18n/en.ts` (add after line 251)

- [ ] **Step 1: Add Chinese translation**

In `src/i18n/zh.ts`, add after `tasks.reviewedAt`:

```typescript
  "tasks.completionNote": "完成说明",
```

- [ ] **Step 2: Add English translation**

In `src/i18n/en.ts`, add after `tasks.reviewedAt`:

```typescript
  "tasks.completionNote": "Completion Note",
```

- [ ] **Step 3: Verify translation key integrity**

Run: `npm run i18n:check`
Expected: No missing translation keys

- [ ] **Step 4: Commit**

```bash
git add src/i18n/zh.ts src/i18n/en.ts
git commit -m "i18n: add tasks.completionNote translation"
```

---

### Task 8: Update Frontend Types and UI

**Files:**
- Modify: `src/app/tasks/[id]/task-detail-page-client.tsx`

- [ ] **Step 1: Add completionNote to Task type**

Update Task type (lines 20-32):

```typescript
export type Task = {
  id: string;
  title: string;
  description: string;
  bountyPoints: number;
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
  completionNote: string | null;  // 新增
  reviewComment: string | null;
  reviewedAt: string | null;
  creator: { id: string; name: string };
  assignee: { id: string; name: string } | null;
};
```

- [ ] **Step 2: Add completionNote display section**

After the task description section (around line 111), add completionNote display:

```typescript
        <div className="mt-6 border-t border-card-border/60 pt-6">
          <MarkdownContent content={task.description} />
        </div>

        {task.completionNote && (
          <div className="mt-6 rounded-2xl border border-card-border/60 bg-card/40 p-4">
            <div className="space-y-3 font-reading">
              <p className="text-xs text-muted">
                {t("tasks.completionNote")}
              </p>
              <MarkdownContent content={task.completionNote} />
            </div>
          </div>
        )}

        {task.reviewComment && (
```

- [ ] **Step 3: Run build to verify no type errors**

Run: `npm run build`
Expected: Build succeeds without type errors

- [ ] **Step 4: Commit**

```bash
git add src/app/tasks/[id]/task-detail-page-client.tsx
git commit -m "feat: display completionNote on task detail page"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Manual testing checklist**

Start dev server: `npm run dev`

Test scenarios:
1. Complete task without completionNote → success, null in DB
2. Complete task with completionNote → success, stored correctly
3. Complete task with empty string → success, null in DB
4. Complete task with 5001 chars → 400 error
5. Reject completed task → completionNote cleared
6. View task detail page → completionNote rendered as Markdown

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address final verification issues"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add completionNote to Prisma schema |
| 2 | Update test fixture |
| 3 | Write tests for complete route |
| 4 | Implement complete route logic |
| 5 | Update verify route to clear on rejection |
| 6 | Update live events type |
| 7 | Add i18n translations |
| 8 | Update frontend types and UI |
| 9 | Final verification |