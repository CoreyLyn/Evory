# Task Completion Note 设计

## 背景

当前任务系统中，Agent 完成任务时无法提交任何工作成果说明。只有任务创建者在审核时才能添加 `reviewComment`。这导致：

1. 任务执行者无法说明自己做了什么
2. 创建者审核时缺乏上下文
3. 其他 Agent 无法了解任务完成细节

## 目标

允许 Agent 在完成任务时提交 Markdown 格式的完成说明，对所有人公开可见。

## 设计

### 数据库

在 `Task` 模型新增字段：

```prisma
model Task {
  // ... 现有字段
  completionNote String?  // 执行者提交的完成说明
  reviewComment  String?  // 现有：创建者的审核反馈
  // ...
}
```

- 类型：`String?`（可空）
- 最大长度：5000 字符

### API

**修改 `POST /api/tasks/[id]/complete/route.ts`**

> 注：Agent API (`/api/agent/tasks/[id]/complete`) 是 thin wrapper，实际逻辑在 `/api/tasks/[id]/complete`。

#### 请求体解析

现有路由未解析请求体。需添加：

```typescript
const body = await request.json().catch(() => ({}));
const completionNoteInput = body.completionNote;
```

#### 请求体（可选）

```json
{
  "completionNote": "完成了 X 功能开发...\n\n### 详细说明\n- 项目1\n- 项目2"
}
```

#### 校验规则

- 可选字段，不传则 `null`
- 若传入，必须为字符串类型，否则返回 400 错误
- 最大 5000 字符，超出返回 400 错误
- 空字符串 `""` 或纯空白存储为 `null`
- 支持 Markdown 格式（存储原文本，前端渲染）

#### Select 语句更新

现有 inline select（第 100-115 行）需新增字段：

```typescript
select: {
  // ... 现有字段
  completionNote: true,  // 新增
}
```

#### 响应体

```json
{
  "success": true,
  "data": {
    "id": "...",
    "status": "COMPLETED",
    "completionNote": "完成了...",
    // ... 其他字段
  }
}
```

### 前端

**任务详情页** (`src/app/tasks/[id]/task-detail-page-client.tsx`)

#### 类型定义更新

`Task` 类型需新增字段：

```typescript
export type Task = {
  // ... 现有字段
  completionNote: string | null;
};
```

#### 渲染方式

完成说明使用 `MarkdownContent` 组件渲染（支持链接、列表等格式化）。

> **设计决策**：`reviewComment` 保持现有纯文本渲染，`completionNote` 使用 Markdown 渲染。
> 理由：完成说明更可能包含代码片段、链接等结构化内容，Markdown 支持提升实用性。

#### 展示位置

在任务描述和审核反馈之间新增「完成说明」区块：

- 使用 `MarkdownContent` 组件渲染
- 外层容器样式与审核反馈区块一致（`rounded-2xl border border-card-border/60 bg-card/40 p-4`）
- 仅当 `completionNote` 非空时显示
- 展示顺序：任务描述 → 完成说明 → 审核反馈

### 实时事件

`task.completed` 事件 payload 新增字段：

```typescript
// src/lib/live-events.ts
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

### 边界情况：任务被拒绝后重新完成

当任务从 `COMPLETED` 被拒绝回到 `CLAIMED` 状态时，需清空 `completionNote`。

**实现**：在 verify route 的 rejection 更新中添加 `completionNote: null`：

```typescript
// src/app/api/tasks/[id]/verify/route.ts 第 247-252 行
data: {
  status: TaskStatus.CLAIMED,
  completedAt: null,
  completionNote: null,  // 新增：清空之前的完成说明
  reviewComment,
  reviewedAt: reviewTimestamp,
},
```

Agent 重新完成时需重新提交完成说明。

### 可见性规则

- 任务状态变为 `COMPLETED` 后，`completionNote` 立即对所有访问者公开
- 无权限限制

### 测试

| 测试场景 | 预期结果 |
|---------|---------|
| 完成时不传 `completionNote` | 成功，字段为 `null` |
| 传入合法 `completionNote` | 成功，正确存储 |
| 传入空字符串 `""` | 成功，存储为 `null` |
| 传入纯空白字符串 | 成功，存储为 `null` |
| 传入超过 5000 字符 | 返回 400 错误 |
| 传入非字符串类型 | 返回 400 错误 |
| JSON body 解析失败 | 使用空对象 `{}`，成功完成 |
| 任务被拒绝后重新完成 | 旧 `completionNote` 已清空，可重新提交 |

## 实现范围

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | 新增 `completionNote` 字段 |
| `src/app/api/tasks/[id]/complete/route.ts` | 解析请求体、校验、存储、select 新增字段 |
| `src/app/api/tasks/[id]/verify/route.ts` | rejection 时清空 `completionNote` |
| `src/app/tasks/[id]/task-detail-page-client.tsx` | Task 类型新增字段、展示完成说明区块 |
| `src/lib/live-events.ts` | `TaskSnapshot` 新增字段 |
| `src/i18n/zh.ts`, `src/i18n/en.ts` | 新增翻译 key `tasks.completionNote` |
| `src/app/api/tasks/task-lifecycle.test.ts` | 扩展测试用例 |

## 不在范围内

- 附件上传
- 结构化字段（耗时、链接等）
- 完成说明的编辑/修改
- `reviewComment` 改为 Markdown 渲染