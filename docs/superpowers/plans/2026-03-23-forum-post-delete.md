# 论坛帖子硬删除功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在管理后台和「我的 Agents」帖子管理中新增永久删除帖子功能（硬删除），与现有「隐藏」（软删除）形成两级内容审核操作。

**Architecture:** 新增 `CONTENT_DELETED` 安全事件类型用于审计。Admin 和 User 各一个 DELETE API route，走 Prisma cascading delete（所有子记录 ForumReply / ForumLike / ForumPostTag / ForumPostView 已配置 `onDelete: Cascade`）。UI 层在现有隐藏/恢复按钮旁新增删除按钮，带二次确认弹窗。

**Tech Stack:** Next.js App Router · Prisma · TypeScript · React

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/admin/forum/posts/[id]/delete/route.ts` | Admin 硬删除 API |
| Create | `src/app/api/users/me/forum/posts/[id]/delete/route.ts` | 用户硬删除自己 Agent 帖子 API |
| Modify | `src/app/api/admin/forum/posts/admin-posts.test.ts` | Admin 删除 API 测试（追加用例） |
| Modify | `src/app/api/users/me/forum/posts/[id]/actions.test.ts` | 用户删除 API 测试（追加用例） |
| Modify | `prisma/schema.prisma:39-47` | 新增 `CONTENT_DELETED` 枚举值 |
| Modify | `src/lib/security-events.ts:3-11` | 新增 `CONTENT_DELETED` 到 `VALID_SECURITY_EVENT_TYPES` |
| Modify | `src/app/admin/page.tsx:203-226,544-569` | Admin UI 新增删除按钮 |
| Modify | `src/app/settings/agents/page.tsx:298-371,888-920` | 用户帖子管理 UI 新增删除按钮 |
| Modify | `src/i18n/zh.ts` | 中文翻译 keys |
| Modify | `src/i18n/en.ts` | 英文翻译 keys |

---

### Task 1: Schema — 新增 CONTENT_DELETED 安全事件类型

**Files:**
- Modify: `prisma/schema.prisma:39-47`
- Modify: `src/lib/security-events.ts:3-11`

- [ ] **Step 1: 在 Prisma schema 的 SecurityEventType 枚举中新增 CONTENT_DELETED**

在 `prisma/schema.prisma` 的 `SecurityEventType` 枚举（约第 39 行）末尾添加：

```prisma
enum SecurityEventType {
  RATE_LIMIT_HIT
  AUTH_FAILURE
  CSRF_REJECTED
  INVALID_AGENT_CREDENTIAL
  AGENT_ABUSE_LIMIT_HIT
  CONTENT_HIDDEN
  CONTENT_RESTORED
  CONTENT_DELETED
}
```

- [ ] **Step 2: 在 security-events.ts 中同步新增类型**

在 `src/lib/security-events.ts` 的 `VALID_SECURITY_EVENT_TYPES` 数组（约第 3 行）末尾添加 `"CONTENT_DELETED"`：

```typescript
export const VALID_SECURITY_EVENT_TYPES = [
  "RATE_LIMIT_HIT",
  "AUTH_FAILURE",
  "CSRF_REJECTED",
  "INVALID_AGENT_CREDENTIAL",
  "AGENT_ABUSE_LIMIT_HIT",
  "CONTENT_HIDDEN",
  "CONTENT_RESTORED",
  "CONTENT_DELETED",
] as const;
```

- [ ] **Step 3: 生成 Prisma Client 并创建迁移**

```bash
npm run db:migrate -- --name add-content-deleted-event-type
npm run prisma:generate
```

Expected: 迁移成功，`CONTENT_DELETED` 值加入 `SecurityEventType` 枚举。

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/lib/security-events.ts
git commit -m "feat: add CONTENT_DELETED security event type"
```

---

### Task 2: Admin 删除帖子 API Route

**Files:**
- Create: `src/app/api/admin/forum/posts/[id]/delete/route.ts`
- Test: 在现有 `src/app/api/admin/forum/posts/admin-posts.test.ts` 中添加测试

**注意：** 测试采用与现有 `admin-posts.test.ts` 相同的 Prisma mock 模式（不使用真实数据库），需要在该文件末尾追加测试用例。

- [ ] **Step 1: 在 admin-posts.test.ts 中追加 delete 测试**

在 `src/app/api/admin/forum/posts/admin-posts.test.ts` 文件顶部的 import 区域，新增 delete route 的导入：

```typescript
import { POST as deletePost } from "./[id]/delete/route";
```

同时在 `AdminPostPrismaMock` 类型的 `forumPost` 中新增 `delete` 方法：

```typescript
type AdminPostPrismaMock = {
  userSession: {
    findUnique: AsyncMethod;
    deleteMany: AsyncMethod<[], { count: number }>;
  };
  forumPost: {
    findMany: AsyncMethod;
    findUnique: AsyncMethod;
    update: AsyncMethod;
    delete: AsyncMethod;  // 新增
    count: AsyncMethod;
  };
  // ... 其余不变
};
```

然后在文件末尾追加以下测试用例：

```typescript
// ---------------------------------------------------------------------------
// POST /api/admin/forum/posts/[id]/delete
// ---------------------------------------------------------------------------

test("POST delete — returns 401 when no session", async () => {
  mockNoSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/delete",
    { method: "POST", headers: { origin: "http://localhost" } }
  );
  const response = await deletePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Unauthorized");
});

test("POST delete — returns 403 when user role is not ADMIN", async () => {
  mockNonAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/delete",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${USER_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await deletePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Forbidden: Admin access required");
});

test("POST delete — returns 404 for missing post", async () => {
  mockAdminSession();

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => null,
    delete: async () => ({}),
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/nonexistent/delete",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await deletePost(
    request,
    createRouteParams({ id: "nonexistent" })
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Post not found");
});

test("POST delete — permanently deletes post and returns deletedId", async () => {
  mockAdminSession();

  const post = createForumPostFixture({ id: "post-1", agentId: "agent-1" });
  let deleteCalled = false;

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => post,
    delete: async () => {
      deleteCalled = true;
      return post;
    },
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/delete",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await deletePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.deletedId, "post-1");
  assert.ok(deleteCalled, "prisma.forumPost.delete should have been called");
});

test("POST delete — creates CONTENT_DELETED SecurityEvent", async () => {
  mockAdminSession();

  const post = createForumPostFixture({ id: "post-1", agentId: "agent-1" });
  let capturedEvent: SecurityEventData | null = null;

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => post,
    delete: async () => post,
  };
  prismaClient.securityEvent = {
    create: async ({ data }: { data: SecurityEventData }) => {
      capturedEvent = data;
      return createSecurityEventFixture();
    },
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/delete",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  await deletePost(request, createRouteParams({ id: "post-1" }));

  assert.ok(capturedEvent, "SecurityEvent should have been created");
  assert.equal(capturedEvent!.type, "CONTENT_DELETED");
  assert.equal(capturedEvent!.routeKey, "admin-forum-delete");
  assert.equal(capturedEvent!.userId, "admin-1");
  assert.equal(
    (capturedEvent!.metadata as Record<string, unknown>).postId,
    "post-1"
  );
});

test("POST delete — returns 403 when origin header is missing", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/delete",
    {
      method: "POST",
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    }
  );
  const response = await deletePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Invalid request origin");
});
```

- [ ] **Step 2: 运行测试确认 delete 测试失败**

```bash
node --import tsx --test src/app/api/admin/forum/posts/admin-posts.test.ts
```

Expected: 新增的 delete 测试 FAIL — `./[id]/delete/route` 模块不存在。已有测试仍然 PASS。

- [ ] **Step 3: 实现 Admin 删除 API**

创建 `src/app/api/admin/forum/posts/[id]/delete/route.ts`：

```typescript
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-forum-delete",
  });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const rateLimited = await enforceRateLimit({
    bucketId: "admin-content-moderation",
    routeKey: "admin-content-moderation",
    maxRequests: 30,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: auth.user.id,
    eventType: "RATE_LIMIT_HIT",
    metadata: { userId: auth.user.id },
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  const { id } = await params;

  try {
    const post = await prisma.forumPost.findUnique({
      where: { id },
      select: { id: true, title: true, agentId: true },
    });
    if (!post) {
      return notForAgentsResponse(
        Response.json({ success: false, error: "Post not found" }, { status: 404 })
      );
    }

    // Hard delete — cascades to replies, likes, tags, views
    await prisma.forumPost.delete({ where: { id } });

    await prisma.securityEvent.create({
      data: {
        type: "CONTENT_DELETED",
        routeKey: "admin-forum-delete",
        ipAddress: getClientIp(request),
        userId: auth.user.id,
        metadata: {
          scope: "admin",
          severity: "high",
          operation: "content_delete",
          summary: `Post "${post.title}" permanently deleted by admin.`,
          postId: id,
          agentId: post.agentId,
        },
      },
    });

    return notForAgentsResponse(
      Response.json({ success: true, data: { deletedId: id } })
    );
  } catch (err) {
    console.error("[admin/forum/posts/[id]/delete POST]", err);
    return notForAgentsResponse(
      Response.json({ success: false, error: "Internal server error" }, { status: 500 })
    );
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
node --import tsx --test src/app/api/admin/forum/posts/admin-posts.test.ts
```

Expected: 全部 PASS，包括新增的 delete 测试。

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/forum/posts/
git commit -m "feat: add admin hard-delete API for forum posts"
```

---

### Task 3: 用户删除帖子 API Route

**Files:**
- Create: `src/app/api/users/me/forum/posts/[id]/delete/route.ts`
- Test: 在现有 `src/app/api/users/me/forum/posts/[id]/actions.test.ts` 中添加测试

**注意：** 测试采用与现有 `actions.test.ts` 相同的 Prisma mock 模式。

- [ ] **Step 1: 在 actions.test.ts 中追加 delete 测试**

在 `src/app/api/users/me/forum/posts/[id]/actions.test.ts` 文件中：

1. 在 `UserForumPostActionsPrismaMock` 类型的 `forumPost` 中新增 `delete` 方法：

```typescript
type UserForumPostActionsPrismaMock = {
  userSession?: {
    findUnique: AsyncMethod;
    deleteMany: AsyncMethod;
  };
  forumPost?: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
    delete: AsyncMethod;  // 新增
  };
};
```

2. 保存并恢复新增的 `delete` 方法引用：

```typescript
const originalForumPostDelete = prismaClient.forumPost?.delete;
```

在 `beforeEach` 中初始化：
```typescript
prismaClient.forumPost = {
  findUnique: async () => null,
  update: async () => ({}),
  delete: async () => ({}),  // 新增
};
```

在 `afterEach` 中恢复：
```typescript
if (originalForumPostDelete) {
  prismaClient.forumPost.delete = originalForumPostDelete;
}
```

3. 新增 `loadDeleteHandler` 函数：

```typescript
async function loadDeleteHandler() {
  const mod = await import("./delete/route").catch(() => null);
  assert.ok(mod, "expected src/app/api/users/me/forum/posts/[id]/delete/route.ts to exist");
  assert.equal(typeof mod.POST, "function");
  return mod.POST;
}
```

4. 在文件末尾追加测试用例：

```typescript
test("POST delete returns 401 without auth", async () => {
  const POST = await loadDeleteHandler();
  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/forum/posts/post-1/delete", {
      method: "POST",
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("POST delete returns 404 when post is not owned by the current user", async () => {
  mockAuthenticatedUser();
  prismaClient.forumPost = {
    findUnique: async () =>
      createForumPostFixture({
        id: "post-1",
        agent: createAgentFixture({ ownerUserId: "other-user" }),
      }),
    update: async () => ({}),
    delete: async () => ({}),
  };

  const POST = await loadDeleteHandler();
  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/forum/posts/post-1/delete", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${USER_TOKEN}`,
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Post not found");
});

test("POST delete permanently deletes owned post and returns deletedId", async () => {
  mockAuthenticatedUser();

  let deleteCalled = false;

  prismaClient.forumPost = {
    findUnique: async () =>
      createForumPostFixture({
        id: "post-1",
        agent: createAgentFixture({ ownerUserId: USER_ID }),
      }),
    update: async () => ({}),
    delete: async () => {
      deleteCalled = true;
      return {};
    },
  };

  const POST = await loadDeleteHandler();
  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/forum/posts/post-1/delete", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${USER_TOKEN}`,
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.deletedId, "post-1");
  assert.ok(deleteCalled, "prisma.forumPost.delete should have been called");
});
```

- [ ] **Step 2: 运行测试确认 delete 测试失败**

```bash
node --import tsx --test src/app/api/users/me/forum/posts/\[id\]/actions.test.ts
```

Expected: 新增的 delete 测试 FAIL — `./delete/route` 模块不存在。已有测试仍然 PASS。

- [ ] **Step 3: 实现用户删除 API**

创建 `src/app/api/users/me/forum/posts/[id]/delete/route.ts`：

```typescript
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateUser } from "@/lib/user-auth";

export async function POST(
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

  try {
    const { id } = await params;
    const post = await prisma.forumPost.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        agent: {
          select: { ownerUserId: true },
        },
      },
    });

    if (!post || post.agent.ownerUserId !== user.id) {
      return Response.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    // Hard delete — cascades to replies, likes, tags, views
    await prisma.forumPost.delete({ where: { id } });

    return Response.json({
      success: true,
      data: { deletedId: id },
    });
  } catch (error) {
    console.error("[users/me/forum/posts/[id]/delete POST]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
node --import tsx --test src/app/api/users/me/forum/posts/\[id\]/actions.test.ts
```

Expected: 全部 PASS，包括新增的 delete 测试。

- [ ] **Step 5: Commit**

```bash
git add src/app/api/users/me/forum/posts/\[id\]/
git commit -m "feat: add user hard-delete API for own agent forum posts"
```

---

### Task 4: i18n 翻译 — 新增删除相关 keys

**Files:**
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: 在 zh.ts 中新增翻译 keys**

在 admin 相关区域添加：

```typescript
"admin.action.delete": "删除",
"admin.action.deleting": "删除中...",
"admin.confirm.delete": "⚠️ 确定要永久删除这个帖子吗？此操作不可撤销，帖子及其所有回复、点赞将被永久移除。",
"admin.deleteSuccess": "帖子已永久删除",
```

- [ ] **Step 2: 在 en.ts 中新增对应翻译 keys**

```typescript
"admin.action.delete": "Delete",
"admin.action.deleting": "Deleting...",
"admin.confirm.delete": "⚠️ Are you sure you want to permanently delete this post? This action cannot be undone. The post and all its replies, likes will be permanently removed.",
"admin.deleteSuccess": "Post permanently deleted",
```

- [ ] **Step 3: 运行 i18n 校验**

```bash
npm run i18n:check
```

Expected: PASS — 两份翻译 key 一致。

- [ ] **Step 4: Commit**

```bash
git add src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: add i18n keys for post delete action"
```

---

### Task 5: Admin 页面 UI — 新增删除按钮

**Files:**
- Modify: `src/app/admin/page.tsx:203-226` (handleAction 函数)
- Modify: `src/app/admin/page.tsx:544-569` (按钮区域)

- [ ] **Step 1: 扩展 handleAction 函数支持 delete**

在 `src/app/admin/page.tsx` 中，修改 `handleAction` 函数签名从 `"hide" | "restore"` 扩展为 `"hide" | "restore" | "delete"`：

```typescript
async function handleAction(postId: string, action: "hide" | "restore" | "delete") {
  const confirmKey =
    action === "delete"
      ? "admin.confirm.delete"
      : action === "hide"
        ? "admin.confirm.hide"
        : "admin.confirm.restore";
  if (!confirm(t(confirmKey as Parameters<typeof t>[0]))) return;

  setBusyId(postId);
  setError(null);
  setSuccess(null);

  try {
    const res = await fetch(`/api/admin/forum/posts/${postId}/${action}`, {
      method: "POST",
    });
    const json = await res.json();
    if (json.success) {
      setSuccess(
        action === "delete"
          ? t("admin.deleteSuccess")
          : t("admin.actionSuccess")
      );
      setRefreshKey((k) => k + 1);
    } else {
      setError(json.error || t("admin.actionFailed"));
    }
  } catch {
    setError(t("admin.actionFailed"));
  }
  setBusyId(null);
}
```

- [ ] **Step 2: 在帖子行中添加删除按钮**

在 `src/app/admin/page.tsx` 中，在现有的隐藏/恢复按钮后面（约第 569 行 `)}` 之后）添加删除按钮。最终按钮区域应呈现为：

```tsx
{/* 现有的隐藏/恢复按钮保持不变 */}
{isHidden ? (
  <Button
    variant="secondary"
    className="shrink-0 px-3 py-1.5 text-xs"
    disabled={isBusy}
    onClick={() => handleAction(post.id, "restore")}
  >
    {isBusy ? t("admin.action.restoring") : t("admin.action.restore")}
  </Button>
) : (
  <Button
    variant="danger"
    className="shrink-0 px-3 py-1.5 text-xs"
    disabled={isBusy}
    onClick={() => handleAction(post.id, "hide")}
  >
    {isBusy ? t("admin.action.hiding") : t("admin.action.hide")}
  </Button>
)}

{/* 新增：删除按钮，始终显示 */}
<Button
  variant="danger"
  className="shrink-0 px-3 py-1.5 text-xs opacity-60 hover:opacity-100"
  disabled={isBusy}
  onClick={() => handleAction(post.id, "delete")}
>
  {isBusy ? t("admin.action.deleting") : t("admin.action.delete")}
</Button>
```

注意：删除按钮使用 `opacity-60 hover:opacity-100` 使其在视觉上比隐藏/恢复按钮低调，避免误触。

- [ ] **Step 3: 手动验证**

```bash
npm run dev
```

在浏览器中打开 admin 页面，确认：
1. 每个帖子行同时显示隐藏/恢复按钮和删除按钮
2. 删除按钮颜色较浅，hover 后变亮
3. 点击删除弹出确认对话框，包含不可撤销的警告
4. 确认后帖子从列表中消失

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: add delete button to admin forum content moderation"
```

---

### Task 6: 用户帖子管理 UI — 新增删除按钮

**Files:**
- Modify: `src/app/settings/agents/page.tsx:298-371` (UserForumPostManagementList 组件)
- Modify: `src/app/settings/agents/page.tsx:888-920` (handleUserPostAction 函数)

- [ ] **Step 1: 扩展 handleUserPostAction 支持 delete**

在 `src/app/settings/agents/page.tsx` 中，修改 `handleUserPostAction` 函数签名和逻辑：

```typescript
async function handleUserPostAction(postId: string, action: "hide" | "restore" | "delete") {
  if (action === "delete") {
    if (!confirm("⚠️ 确定要永久删除这个帖子吗？此操作不可撤销，帖子及其所有回复、点赞将被永久移除。")) return;
  }

  setUserPostsBusyId(postId);
  setUserPostsError(null);

  try {
    const response = await fetch(`/api/users/me/forum/posts/${postId}/${action}`, {
      method: "POST",
    });
    const json = await response.json();

    if (!response.ok || !json.success) {
      throw new Error(json.error ?? "操作失败");
    }

    // Reload list
    const params = new URLSearchParams({
      page: String(userPostsPage),
      pageSize: "20",
      ...(userPostsStatus === "hidden" ? { status: "hidden" } : {}),
      ...(userPostsAgentId ? { agentId: userPostsAgentId } : {}),
    });
    const reload = await fetch(`/api/users/me/forum/posts?${params.toString()}`);
    // ... (rest of existing reload logic remains unchanged)
```

- [ ] **Step 2: 扩展 UserForumPostManagementList 组件的 onAction 类型和按钮**

修改组件的 `onAction` prop 类型：

```typescript
onAction: (postId: string, action: "hide" | "restore" | "delete") => void;
```

在按钮区域（约第 357 行），将单个按钮替换为两个按钮：

```tsx
<div className="flex shrink-0 gap-2">
  <Button
    type="button"
    variant={isHidden ? "secondary" : "danger"}
    disabled={isBusy}
    onClick={() => onAction(post.id, isHidden ? "restore" : "hide")}
  >
    {isBusy ? "处理中..." : isHidden ? "恢复" : "隐藏"}
  </Button>
  <Button
    type="button"
    variant="danger"
    className="opacity-60 hover:opacity-100"
    disabled={isBusy}
    onClick={() => onAction(post.id, "delete")}
  >
    {isBusy ? "处理中..." : "删除"}
  </Button>
</div>
```

- [ ] **Step 3: 手动验证**

```bash
npm run dev
```

在浏览器中打开「设置 → 我的 Agents → 帖子」页面，确认：
1. 每个帖子行显示隐藏/恢复按钮和删除按钮
2. 点击删除弹出确认框
3. 确认后帖子从列表中消失

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/agents/page.tsx
git commit -m "feat: add delete button to user agent post management"
```

---

### Task 7: 构建验证与全量测试

**Files:** 无新增文件

- [ ] **Step 1: 运行 lint**

```bash
npm run lint
```

Expected: 无新增 error。

- [ ] **Step 2: 运行全量测试**

```bash
npm test
```

Expected: 全部通过，包括新增的 delete route 测试。

- [ ] **Step 3: 运行生产构建**

```bash
npm run build
```

Expected: 构建成功，无 TypeScript 错误。

- [ ] **Step 4: 最终 Commit（如有修复）**

```bash
git add -A
git commit -m "fix: address lint/build issues from post delete feature"
```
