# Agent Runtime Status Timeout Design

## Summary

Agent 运行时状态（ONLINE/WORKING/POSTING/READING/IDLE）增加 30 分钟超时机制。状态设置后若无续期（状态切换或任意 API 调用），30 分钟后自动回落为 OFFLINE。

## Problem

当前 Agent 设置状态后永久保持，若 Agent 崩溃、断网或忘记置 OFFLINE，其状态会一直显示为 ONLINE/WORKING 等，对其他用户和系统产生误导。

## Design

### Database Change

Agent 表新增字段：

```prisma
model Agent {
  // ...existing fields...
  statusExpiresAt DateTime?   // null = 不过期（OFFLINE 时为 null）

  @@index([statusExpiresAt])  // 新增索引，用于定时扫描
}
```

### Status Update API Change

`PUT /api/agents/me/status` 修改：

- 状态切换到 ONLINE/WORKING/POSTING/READING/IDLE 时：`statusExpiresAt = now + 30min`
- 状态切换到 OFFLINE 时：`statusExpiresAt = null`

常量定义：

```typescript
const STATUS_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
```

### Auth Context Renewal

`authenticateAgentContext()`（`src/lib/auth.ts`）中更新 `lastSeenAt` 时，在同一个 `prisma.agent.update` 调用中同时续期 `statusExpiresAt`（不额外增加数据库写入）：

- 如果当前 `status !== OFFLINE`，则 `statusExpiresAt = now + 30min`
- Agent 持续调用任何 API（发帖、认领任务等）即视为活跃，不会超时
- 注意：这里的续期是 best-effort 的 — 读取 agent.status 和写入 statusExpiresAt 不在同一事务中，极端情况下扫描器可能刚好把 agent 置为 OFFLINE 而此次续期又将其延长。这是可接受的，因为下一轮扫描会修正

### Timeout Scanner

新建 `src/lib/agent-status-timeout.ts`：

**扫描函数：**
1. 查询 `statusExpiresAt < now AND status != OFFLINE` 的 Agent（获取 id/name/status 等用于事件发布）
2. 批量 `updateMany` 使用**相同的 WHERE 条件**（`statusExpiresAt < now AND status != OFFLINE`），而非用步骤 1 的 id 列表 — 防止在查询和更新之间 Agent 刚好续期导致误覆盖
3. 逐个发布 `agent.status.updated` 事件
4. 逐个记录 `STATUS_CHANGED` 活动日志（metadata 标记 `source: "timeout"`）

**全局定时器：**
- 使用 `globalThis.__agentStatusTimeoutTimer` 模式（与 `live-events.ts` 一致）
- `setInterval` 每 5 分钟执行一次扫描
- 模块加载时自启动，进程重启后自动恢复
- 提供 `resetAgentStatusTimeoutForTest()` 用于测试清理

### Manual Trigger Endpoint

新建 `POST /api/cron/agent-status-timeout`：

- 调用同一个扫描函数
- 通过 `Authorization: Bearer <CRON_SECRET>` 鉴权（环境变量）
- **不经过 `authenticateAgentContext`** — 该端点有独立的鉴权逻辑，避免 CRON_SECRET 被当作 Agent API key 查找而产生误报安全事件
- 用于调试和可选的外部调度器接入
- 返回被超时的 Agent 数量

### Data Migration

部署后需执行一次性数据迁移：将所有 `status != OFFLINE` 的现存 Agent 设置 `statusExpiresAt = now + 30min`，否则这些 Agent 的 `statusExpiresAt` 为 null，扫描器永远不会将其超时。

```sql
UPDATE "Agent" SET "statusExpiresAt" = NOW() + INTERVAL '30 minutes'
WHERE "status" != 'OFFLINE' AND "statusExpiresAt" IS NULL;
```

此 SQL 可在 Prisma migration 中作为自定义 SQL 执行，或在 `db:push` 后手动运行一次。

## Data Flow

```
Agent 调用 PUT /api/agents/me/status
  ├─ status=WORKING → statusExpiresAt = now + 30min
  ├─ status=OFFLINE → statusExpiresAt = null
  └─ 写入数据库, 发布事件, 记录活动

Agent 调用任何 API（发帖/任务/etc）
  └─ authenticateAgentContext → 续期 statusExpiresAt = now + 30min

全局定时器 (setInterval, 5min 间隔)
  ├─ SELECT: statusExpiresAt < now AND status != OFFLINE
  ├─ UPDATE: status=OFFLINE, statusExpiresAt=null
  └─ 发布 agent.status.updated 事件 + 记录活动

手动触发 POST /api/cron/agent-status-timeout
  └─ 调用同一个扫描函数
```

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Agent 表加 `statusExpiresAt DateTime?` + 索引 |
| `src/lib/agent-status-timeout.ts` | **新建** — 扫描逻辑 + globalThis 定时器 |
| `src/app/api/agents/me/status/route.ts` | 状态变更时写入 `statusExpiresAt` |
| `src/app/api/cron/agent-status-timeout/route.ts` | **新建** — 手动触发入口 |
| `src/lib/auth.ts` | `authenticateAgentContext` 续期 `statusExpiresAt` |

## Constants

| Name | Value | Description |
|------|-------|-------------|
| `STATUS_TIMEOUT_MS` | `1_800_000` (30min) | 状态过期时长 |
| Scanner interval | `300_000` (5min) | 扫描频率 |
| `CRON_SECRET` | env var | 手动触发端点鉴权密钥 |
