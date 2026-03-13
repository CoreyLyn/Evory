# Agent 名称和类型修改功能实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在"我的 Agents"页面添加 Agent 名称和类型的修改功能，让用户可以在认领后修改 Agent 的显示名称和类型。

**Architecture:** 添加 PATCH API endpoint 处理更新请求，在前端 Agent 卡片上添加编辑模式，使用内联编辑 UI 模式。

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7, Node.js native test runner

---

## Chunk 0: Database Schema

### Task 0: 添加 CODEX 到 AgentType enum

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 修改 AgentType enum**

在 `prisma/schema.prisma` 中，将 AgentType enum 从:

```prisma
enum AgentType {
  OPENCLAW
  CLAUDE_CODE
  CUSTOM
}
```

改为:

```prisma
enum AgentType {
  OPENCLAW
  CLAUDE_CODE
  CODEX
  CUSTOM
}
```

- [ ] **Step 2: 生成 Prisma Client**

Run: `npm run prisma:generate`
Expected: 成功生成

- [ ] **Step 3: 同步到数据库**

Run: `npm run db:push`
Expected: 成功同步

- [ ] **Step 4: 提交 schema 变更**

```bash
git add prisma/schema.prisma
git commit -m "feat: add CODEX to AgentType enum"
```

---

## Chunk 1: API Endpoint

### Task 1: 创建 PATCH API endpoint

**Files:**
- Modify: `src/app/api/users/me/agents/[id]/route.ts`
- Create: `src/app/api/users/me/agents/[id]/route.test.ts`

- [ ] **Step 1: 编写失败的测试 - 认证失败返回 401**

```typescript
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest, createRouteParams } from "@/test/request-helpers";
import { GET } from "./route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type UpdateAgentPrismaMock = {
  agent?: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as UpdateAgentPrismaMock;
const originalAgentFindUnique = prismaClient.agent?.findUnique;
const originalAgentUpdate = prismaClient.agent?.update;

afterEach(() => {
  if (prismaClient.agent) {
    if (originalAgentFindUnique) prismaClient.agent.findUnique = originalAgentFindUnique;
    if (originalAgentUpdate) prismaClient.agent.update = originalAgentUpdate;
  }
});

test("PATCH returns 401 when not authenticated", async () => {
  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { name: "New Name" },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: FAIL with "PATCH is not defined"

- [ ] **Step 3: 添加 PATCH 函数骨架**

在 `src/app/api/users/me/agents/[id]/route.ts` 末尾添加:

```typescript
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return Response.json(
    { success: false, error: "Not implemented" },
    { status: 501 }
  );
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: PASS

- [ ] **Step 5: 编写失败的测试 - Agent 不存在返回 404**

```typescript
test("PATCH returns 404 when agent not found or not owned", async () => {
  prismaClient.agent = {
    findUnique: async () => null,
    update: async () => ({ id: "agt-1", name: "test", type: "CUSTOM" }),
  };

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { name: "New Name" },
      headers: {
        cookie: "evory_user_session=test-session",
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Agent not found");
});
```

- [ ] **Step 6: 运行测试验证失败**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: FAIL with "Not implemented"

- [ ] **Step 7: 实现 Agent 查找逻辑**

```typescript
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "agent-update",
    userId: user.id,
  });

  if (sameOriginRejected) {
    return sameOriginRejected;
  }

  const { id } = await params;

  try {
    const agent = await updatePrisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
        claimStatus: true,
      },
    });

    if (!agent || agent.ownerUserId !== user.id) {
      return Response.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    return Response.json(
      { success: false, error: "Not implemented" },
      { status: 501 }
    );
  } catch (error) {
    console.error("[users/me/agents/[id] PATCH]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

需要添加必要的导入:
```typescript
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
```

添加 Prisma mock 类型:
```typescript
type UpdateOwnedAgentPrismaClient = {
  agent: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      name: string;
      type: string;
      ownerUserId?: string | null;
      claimStatus?: string | null;
    } | null>;
    update: (args: unknown) => Promise<{
      id: string;
      name: string;
      type: string;
    }>;
  };
};

const updatePrisma = prisma as unknown as UpdateOwnedAgentPrismaClient;
```

- [ ] **Step 8: 运行测试验证通过**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: PASS

- [ ] **Step 9: 编写失败的测试 - 成功更新名称**

```typescript
test("PATCH updates agent name successfully", async () => {
  let updatedData: Record<string, unknown> | null = null;

  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: "user-1",
      claimStatus: "ACTIVE",
    }),
    update: async (args: unknown) => {
      const { data } = args as { data: Record<string, unknown> };
      updatedData = data;
      return { id: "agt-1", name: "New Name", type: "CUSTOM" };
    },
  };

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { name: "New Name" },
      headers: {
        cookie: "evory_user_session=test-session",
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.name, "New Name");
  assert.deepEqual(updatedData, { name: "New Name", updatedAt: undefined });
});
```

- [ ] **Step 10: 运行测试验证失败**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: FAIL with "Not implemented"

- [ ] **Step 11: 实现更新逻辑**

```typescript
const VALID_AGENT_TYPES = ["OPENCLAW", "CLAUDE_CODE", "CODEX", "CUSTOM"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "agent-update",
    userId: user.id,
  });

  if (sameOriginRejected) {
    return sameOriginRejected;
  }

  const { id } = await params;

  try {
    const agent = await updatePrisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
        claimStatus: true,
      },
    });

    if (!agent || agent.ownerUserId !== user.id) {
      return Response.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }

    if (typeof body.type === "string" && VALID_AGENT_TYPES.includes(body.type as typeof VALID_AGENT_TYPES[number])) {
      updates.type = body.type;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await updatePrisma.agent.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        name: true,
        type: true,
      },
    });

    return Response.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("[users/me/agents/[id] PATCH]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 12: 运行测试验证通过**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: PASS

- [ ] **Step 13: 编写失败的测试 - 更新类型**

```typescript
test("PATCH updates agent type successfully", async () => {
  let updatedData: Record<string, unknown> | null = null;

  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: "user-1",
      claimStatus: "ACTIVE",
    }),
    update: async (args: unknown) => {
      const { data } = args as { data: Record<string, unknown> };
      updatedData = data;
      return { id: "agt-1", name: "Test Agent", type: "CODEX" };
    },
  };

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { type: "CODEX" },
      headers: {
        cookie: "evory_user_session=test-session",
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.type, "CODEX");
});
```

- [ ] **Step 14: 运行测试验证通过**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: PASS

- [ ] **Step 15: 编写失败的测试 - 无效类型返回 400**

```typescript
test("PATCH returns 400 for invalid type", async () => {
  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: "user-1",
      claimStatus: "ACTIVE",
    }),
    update: async () => ({ id: "agt-1", name: "test", type: "CUSTOM" }),
  };

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { type: "INVALID_TYPE" },
      headers: {
        cookie: "evory_user_session=test-session",
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "No valid fields to update");
});
```

- [ ] **Step 16: 运行测试验证通过**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: PASS

- [ ] **Step 17: 编写失败的测试 - 名称唯一性冲突返回 409**

```typescript
test("PATCH returns 409 when name is already taken", async () => {
  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: "user-1",
      claimStatus: "ACTIVE",
    }),
    update: async () => {
      const error = new Error("Unique constraint failed");
      (error as unknown as Record<string, unknown>).code = "P2002";
      throw error;
    },
  };

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { name: "Existing Name" },
      headers: {
        cookie: "evory_user_session=test-session",
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.success, false);
  assert.equal(json.error, "Agent name already taken");
});
```

- [ ] **Step 18: 运行测试验证失败**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: FAIL with "Internal server error"

- [ ] **Step 19: 处理唯一性约束错误**

修改 catch 块:

```typescript
  } catch (error) {
    if (
      error instanceof Error &&
      (error as unknown as Record<string, unknown>).code === "P2002"
    ) {
      return Response.json(
        { success: false, error: "Agent name already taken" },
        { status: 409 }
      );
    }

    console.error("[users/me/agents/[id] PATCH]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
```

- [ ] **Step 20: 运行测试验证通过**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: PASS

- [ ] **Step 21: 提交 API endpoint**

```bash
git add src/app/api/users/me/agents/\[id\]/route.ts src/app/api/users/me/agents/\[id\]/route.test.ts
git commit -m "feat: add PATCH endpoint for updating agent name and type"
```

---

## Chunk 2: Frontend UI

### Task 2: 添加编辑模式的 UI 组件

**Files:**
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/app/settings/agents/page.test.tsx`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: 添加 i18n 翻译 key**

在 `src/i18n/zh.ts` 的 `agents` 部分添加:

```typescript
  "agents.editName": "编辑名称",
  "agents.editType": "编辑类型",
  "agents.save": "保存",
  "agents.cancel": "取消",
  "agents.saving": "保存中...",
  "agents.namePlaceholder": "输入新名称",
  "agents.typePlaceholder": "选择类型",
  "agents.typeOpenclaw": "OpenClaw",
  "agents.typeClaudeCode": "Claude Code",
  "agents.typeCodex": "Codex",
  "agents.typeCustom": "自定义",
  "agents.updateSuccess": "更新成功",
  "agents.updateFailed": "更新失败",
```

- [ ] **Step 2: 添加英文翻译**

在 `src/i18n/en.ts` 的 `agents` 部分添加相同 key 的英文翻译。

- [ ] **Step 3: 添加编辑状态到 ManagedAgent 类型**

修改 `src/app/settings/agents/page.tsx` 中的 `ManagedAgent` 类型，确保包含 `type` 字段（已存在）。

添加编辑状态类型:

```typescript
type EditingAgent = {
  id: string;
  field: "name" | "type";
  value: string;
};
```

- [ ] **Step 4: 添加编辑状态管理**

在组件中添加状态:

```typescript
const [editingAgent, setEditingAgent] = useState<EditingAgent | null>(null);
const [savingEdit, setSavingEdit] = useState(false);
```

- [ ] **Step 5: 添加 handleUpdateAgent 函数**

```typescript
async function handleUpdateAgent(agentId: string, updates: { name?: string; type?: string }) {
  setSavingEdit(true);
  setError(null);

  try {
    const response = await fetch(`/api/users/me/agents/${agentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });
    const json = await response.json();

    if (!response.ok || !json.success) {
      throw new Error(json.error ?? "更新失败");
    }

    setEditingAgent(null);
    await loadData(securityEventsPage);
  } catch (nextError) {
    setError(nextError instanceof Error ? nextError.message : "更新失败");
  } finally {
    setSavingEdit(false);
  }
}
```

- [ ] **Step 6: 创建 AgentCard 组件**

提取 Agent 卡片为独立组件以简化编辑 UI:

```typescript
function AgentCard({
  agent,
  isBusy,
  isEditing,
  editingValue,
  onRotate,
  onRevoke,
  onEditStart,
  onEditCancel,
  onEditSave,
  onEditChange,
}: {
  agent: ManagedAgent;
  isBusy: boolean;
  isEditing: boolean;
  editingValue: EditingAgent | null;
  onRotate: (id: string) => void;
  onRevoke: (id: string) => void;
  onEditStart: (id: string, field: "name" | "type", value: string) => void;
  onEditCancel: () => void;
  onEditSave: () => void;
  onEditChange: (value: string) => void;
}) {
  // ... 组件实现
}
```

- [ ] **Step 7: 实现名称编辑 UI**

在 Agent 卡片中添加可编辑名称:

```tsx
{editingAgent?.id === agent.id && editingAgent.field === "name" ? (
  <div className="flex items-center gap-2">
    <input
      type="text"
      value={editingAgent.value}
      onChange={(e) => setEditingAgent({ ...editingAgent, value: e.target.value })}
      className="flex-1 rounded-xl border border-accent/40 bg-background/60 px-3 py-1.5 text-lg font-semibold text-foreground focus:border-accent focus:outline-none"
      placeholder="输入新名称"
      disabled={savingEdit}
    />
    <Button
      variant="secondary"
      onClick={() => void handleUpdateAgent(agent.id, { name: editingAgent.value })}
      disabled={savingEdit || !editingAgent.value.trim()}
    >
      {savingEdit ? "保存中..." : "保存"}
    </Button>
    <Button
      variant="ghost"
      onClick={() => setEditingAgent(null)}
      disabled={savingEdit}
    >
      取消
    </Button>
  </div>
) : (
  <div className="flex items-center gap-2">
    <h2 className="font-display text-2xl font-semibold text-foreground">
      {agent.name}
    </h2>
    <button
      type="button"
      onClick={() => setEditingAgent({ id: agent.id, field: "name", value: agent.name })}
      className="text-muted hover:text-accent transition-colors"
      disabled={busyAgentId === agent.id || agent.claimStatus === "REVOKED"}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  </div>
)}
```

- [ ] **Step 8: 实现类型编辑 UI**

在类型显示处添加可编辑下拉:

```tsx
{editingAgent?.id === agent.id && editingAgent.field === "type" ? (
  <div className="flex items-center gap-2">
    <select
      value={editingAgent.value}
      onChange={(e) => setEditingAgent({ ...editingAgent, value: e.target.value })}
      className="rounded-xl border border-accent/40 bg-background/60 px-3 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
      disabled={savingEdit}
    >
      <option value="OPENCLAW">OpenClaw</option>
      <option value="CLAUDE_CODE">Claude Code</option>
      <option value="CODEX">Codex</option>
      <option value="CUSTOM">自定义</option>
    </select>
    <Button
      variant="secondary"
      onClick={() => void handleUpdateAgent(agent.id, { type: editingAgent.value })}
      disabled={savingEdit}
    >
      {savingEdit ? "保存中..." : "保存"}
    </Button>
    <Button
      variant="ghost"
      onClick={() => setEditingAgent(null)}
      disabled={savingEdit}
    >
      取消
    </Button>
  </div>
) : (
  <div className="flex items-center gap-2">
    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted/60">
      {agent.type}
    </p>
    <button
      type="button"
      onClick={() => setEditingAgent({ id: agent.id, field: "type", value: agent.type })}
      className="text-muted hover:text-accent transition-colors"
      disabled={busyAgentId === agent.id || agent.claimStatus === "REVOKED"}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  </div>
)}
```

- [ ] **Step 9: 添加测试**

在 `src/app/settings/agents/page.test.tsx` 中添加测试:

```typescript
test("AgentCard renders edit buttons for active agents", () => {
  const agent: ManagedAgent = {
    id: "agt-1",
    name: "Test Agent",
    type: "CLAUDE_CODE",
    status: "ONLINE",
    points: 100,
    claimStatus: "ACTIVE",
    claimedAt: "2026-03-13T00:00:00Z",
    lastSeenAt: "2026-03-13T00:00:00Z",
    credentialLast4: "1234",
    credentialLabel: "default",
    recentAudits: [],
  };

  // 测试编辑按钮是否渲染
});

test("AgentCard hides edit buttons for revoked agents", () => {
  // 测试 REVOKED 状态下编辑按钮是否禁用
});
```

- [ ] **Step 10: 运行测试验证**

Run: `npm test`
Expected: PASS

- [ ] **Step 11: 提交前端 UI**

```bash
git add src/app/settings/agents/page.tsx src/app/settings/agents/page.test.tsx src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: add inline edit UI for agent name and type"
```

---

## Chunk 3: Integration & Polish

### Task 3: 添加限流和安全防护

**Files:**
- Modify: `src/app/api/users/me/agents/[id]/route.ts`
- Modify: `src/app/api/users/me/agents/[id]/route.test.ts`

- [ ] **Step 1: 编写失败的测试 - 限流返回 429**

```typescript
test("PATCH enforces rate limit", async () => {
  // Mock rate limit to return 429
  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { name: "New Name" },
      headers: {
        cookie: "evory_user_session=test-session",
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "agt-1" })
  );

  assert.equal(response.status, 429);
});
```

- [ ] **Step 2: 添加限流逻辑**

在 PATCH 函数中添加:

```typescript
const rateLimited = await enforceRateLimit({
  bucketId: "agent-update",
  routeKey: "agent-update",
  maxRequests: 20,
  windowMs: 10 * 60 * 1000,
  request,
  subjectId: user.id,
  userId: user.id,
  metadata: {
    agentId: id,
  },
});

if (rateLimited) {
  return rateLimited;
}
```

需要添加导入:
```typescript
import { enforceRateLimit } from "@/lib/rate-limit";
```

- [ ] **Step 3: 运行测试验证**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: PASS

- [ ] **Step 4: 运行全量测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 提交限流**

```bash
git add src/app/api/users/me/agents/\[id\]/route.ts src/app/api/users/me/agents/\[id\]/route.test.ts
git commit -m "feat: add rate limiting to agent update endpoint"
```

---

## Execution Handoff

计划完成并保存到 `docs/superpowers/plans/2026-03-13-agent-name-type-edit.md`。准备执行？

**执行路径:**

**如果有 subagents (Claude Code 等):**
- **REQUIRED:** 使用 superpowers:subagent-driven-development
- 不要提供选择 - subagent-driven 是标准方法
- 每个任务一个新 subagent + 两阶段审查