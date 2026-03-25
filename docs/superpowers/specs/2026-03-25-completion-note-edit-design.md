# Task Completion Note 编辑功能设计

## 背景

现有 completionNote 功能仅在完成任务时提交，不支持后续修改。用户反馈需要允许执行者在任务审核前修正或补充完成说明。

## 目标

允许 assignee 在任务处于 COMPLETED 状态时修改 completionNote。

## 设计

### 业务规则

| 项目 | 规则 |
|------|------|
| 允许修改的状态 | 仅 COMPLETED |
| 操作者 | 仅 assignee |
| 历史版本 | 不保留，直接覆盖 |

### API

**端点**：`PATCH /api/tasks/[id]/completion-note`

**认证**：Bearer Token（Agent API）

**权限**：
- 需要 `tasks:write` scope
- 仅 assignee 可调用

**请求体**：
```json
{
  "completionNote": "更新后的完成说明..."
}
```

**校验规则**（与 complete 接口一致）：
- 必须为字符串类型，否则返回 400
- 最大 5000 字符，超出返回 400
- 空字符串或纯空白存储为 `null`

**状态校验**：
- 任务必须处于 `COMPLETED` 状态
- 其他状态返回 400 错误 `{ success: false, error: "Can only update completionNote when task is COMPLETED" }`

**响应体**：
```json
{
  "success": true,
  "data": {
    "id": "...",
    "status": "COMPLETED",
    "completionNote": "更新后的内容",
    // ... 其他 task 字段
  }
}
```

**错误响应**：

| 状态码 | 场景 | 错误信息 |
|--------|------|----------|
| 400 | 非 COMPLETED 状态 | Can only update completionNote when task is COMPLETED |
| 400 | completionNote 非字符串 | completionNote must be a string |
| 400 | 超过 5000 字符 | completionNote must be at most 5000 characters |
| 403 | 非 assignee | Only the assignee can update this task's completion note |
| 404 | 任务不存在 | Task not found |

### Rate Limit

与 complete 接口保持一致：
- `bucketId`: `"task-completion-note-update"`
- `maxRequests`: `10`
- `windowMs`: `10 * 60 * 1000`（10 分钟）

### Side Effects

**Activity Log**：不记录。编辑 completionNote 是轻微操作，无需 activity log。

**Live Events**：不发布。修改 completionNote 不影响任务状态，无需实时事件通知。

### Agent Status

Agent wrapper 不更新 agent status。与 complete 操作不同，编辑 completionNote 是轻量操作。

### 实现细节

#### 新建文件

**`src/app/api/tasks/[id]/completion-note/route.ts`**

```typescript
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import {
  agentContextHasScope,
  authenticateAgentContext,
  forbiddenAgentScopeResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { TaskStatus } from "@/generated/prisma/client";

const COMPLETION_NOTE_MAX_LENGTH = 5000;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. 认证 + scope 校验
  // 2. Rate limit (bucketId: "task-completion-note-update", maxRequests: 10, windowMs: 10min)
  // 3. 解析请求体
  // 4. 校验 completionNote
  // 5. 查询任务，校验状态和 assignee
  // 6. 更新 completionNote
  // 7. 返回更新后的 task（无 activity log，无 live event）
}
```

**`src/app/api/agent/tasks/[id]/completion-note/route.ts`**

Thin wrapper，直接调用 PATCH handler。不更新 agent status。

#### 复用常量

`COMPLETION_NOTE_MAX_LENGTH = 5000` 已在 complete route 定义，考虑提取到共享常量文件或保持独立定义。

### 测试用例

| 场景 | 预期结果 |
|------|----------|
| COMPLETED 状态的 assignee 修改 | 200，成功更新 |
| 非 COMPLETED 状态 | 400 错误 |
| 非 assignee 调用 | 403 错误 |
| 任务不存在 | 404 错误 |
| 传入空字符串 | 成功，存储为 null |
| 传入超过 5000 字符 | 400 错误 |
| 传入非字符串类型 | 400 错误 |
| 无 tasks:write scope | 403 错误 |
| 无认证 | 401 错误 |

## 实现范围

| 文件 | 改动 |
|------|------|
| `src/app/api/tasks/[id]/completion-note/route.ts` | 新建 PATCH handler |
| `src/app/api/agent/tasks/[id]/completion-note/route.ts` | 新建 thin wrapper |
| `src/app/api/tasks/task-lifecycle.test.ts` | 新增测试用例 |

## 不在范围内

- completionNote 删除功能（可传空字符串实现）
- 历史版本记录
- Web UI 编辑界面