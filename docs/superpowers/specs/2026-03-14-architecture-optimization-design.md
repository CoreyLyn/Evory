# Evory 架构与代码全面优化设计

**日期**: 2026-03-14
**状态**: Draft
**方案**: 渐进式改进（方案 A）

## 背景

对 Evory 代码库进行全面审查后，识别出 12 个优化点，涵盖生产稳定性、代码质量和性能增强三个维度。整体代码质量评分 8.5/10，架构设计（双平面 API）扎实，主要改进空间在细节层面。

采用渐进式改进策略：按优先级分 3 批推进，每批独立可部署。

---

## 第 1 批：高优先级（影响生产）

### 1.1 统一错误处理

**问题**: 代码中散布 61 处 `console.error()`（分布在约 52 个文件中，包括 API route、lib 工具和组件），每个 API route handler 各自 try-catch，格式不一致，难以监控。

**方案**:

- 创建 `src/lib/api-utils.ts`，提供 `withErrorHandler(handler)` 高阶函数包装 route handler
- 统一捕获异常，按类型返回适当的 HTTP 状态码（400/401/403/404/500）
- 定义 `AppError` 类（含 statusCode、code、message），业务代码抛出结构化错误
- 替换散落的 `console.error` 为结构化日志（统一格式：timestamp、route、error code、message）
- Agent API 和 User API 共享同一套错误处理，仅响应头不同

```typescript
// 之前
export async function GET(request: NextRequest) {
  try {
    // ... 业务逻辑
  } catch (error) {
    console.error("Failed to get posts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// 之后
export const GET = withErrorHandler(async (request: NextRequest) => {
  // ... 业务逻辑，异常自动捕获
  throw new AppError(404, "POST_NOT_FOUND", "Post not found");
});
```

**文件变更**:
- 新建: `src/lib/api-utils.ts`（AppError 类 + withErrorHandler）
- 修改: 61 处 `console.error` 所在的约 52 个文件（可逐步迁移）

### 1.2 Task 状态机约束

**问题**: Task 状态转换（OPEN → CLAIMED → COMPLETED → VERIFIED / CANCELLED）仅在业务代码中检查，数据库层无约束。并发操作可能导致非法状态转换。此外，`tasks/[id]/complete/route.ts` 使用 `prisma.task.update` 而非 `updateMany` + status guard，存在并发竞态。

**方案**:

- 创建 `src/lib/task-state-machine.ts`，定义合法状态转换映射（含 CANCELLED 状态）
- 提供 `validateTransition(from, to): boolean` 函数
- 在所有修改 Task status 的地方调用验证
- 将 `tasks/[id]/complete/route.ts` 从 `update` 迁移到 `updateMany` + status guard，与 claim route 模式一致
- 使用 Prisma `updateMany` 的 where 条件同时检查当前状态

```typescript
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  OPEN: ["CLAIMED", "CANCELLED"],
  CLAIMED: ["OPEN", "COMPLETED", "CANCELLED"],
  COMPLETED: ["VERIFIED", "CLAIMED"],  // CLAIMED 用于验证被拒回退
  VERIFIED: [],   // 终态
  CANCELLED: [],  // 终态
};
```

**文件变更**:
- 新建: `src/lib/task-state-machine.ts`
- 修改: `src/app/api/tasks/` 和 `src/app/api/agent/tasks/` 下的状态变更路由

### 1.3 速率限制竞态条件

**问题**: `rate-limit-store.ts` 的 `increment` 方法分两步执行：先 `deleteMany` 清除过期窗口，再 `upsert` 递增计数。虽然 Prisma 的 `increment` 操作本身是原子的（转换为 `SET count = count + 1`），但 `deleteMany` 和 `upsert` 之间存在竞态窗口——并发请求可能在过期窗口被清除后、新 upsert 之前插入记录，导致计数不准确。

**方案**:

- 将 `deleteMany` + `upsert` 合并为单条 raw SQL 事务，使用 `$executeRaw` 执行
- 在单条 SQL 中完成「清理过期 + 递增 + 返回计数」，消除两步操作间的竞态窗口
- 保持现有的 `checkRateLimit` 接口不变，仅改 store 内部实现
- 不引入 Redis，保持单实例架构的简洁性

**文件变更**:
- 修改: `src/lib/rate-limit-store.ts`（内部实现变更，接口不变）

### 1.4 Sidebar 重复请求

**问题**: `sidebar.tsx` 在 `useEffect([], ...)` 中调用 `/api/auth/me`，虽然依赖数组为空（只在 mount 时触发），但导航切换页面时 Sidebar 组件会重新挂载，导致重复请求。

**方案**:

- 创建 `src/lib/hooks/use-current-user.ts`（新建 `src/lib/hooks/` 目录作为自定义 hook 的统一存放位置），封装 `/api/auth/me` 请求并缓存结果
- 使用 `useRef` + 状态管理避免重复请求（请求进行中不发新请求）
- 添加适当的缓存时间（5 分钟内不重复请求）
- 不引入 SWR/React Query 等新依赖

**文件变更**:
- 新建: `src/lib/hooks/use-current-user.ts`
- 修改: `src/components/layout/sidebar.tsx`

---

## 第 2 批：中优先级（代码质量）

### 2.1 清理未使用的 socket.io 依赖

**问题**: `socket.io` 和 `socket.io-client` 已安装但未使用，实际实时通信使用进程内事件总线 + SSE。

**方案**:

- 确认无 import 后执行 `npm uninstall socket.io socket.io-client`
- 减少 node_modules 体积和安全攻击面

**文件变更**:
- 修改: `package.json`、`package-lock.json`

### 2.2 提取 Tailwind 设计 token

**问题**: 组件中大量重复的内联样式（渐变、阴影、圆角组合），修改主题需全局搜索替换。

**方案**:

- 项目使用 Tailwind CSS v4，配置通过 CSS `@theme` 指令完成（而非传统的 `tailwind.config.ts`）
- 在 `src/app/globals.css` 中使用 `@theme` 块注册重复 3 次以上的设计 token：
  - 自定义颜色（accent、accent-secondary 等品牌色已通过 CSS 变量定义，确认 `@theme` 注册）
  - 常用阴影组合
  - 常用渐变
- 组件中用语义化 class 替代冗长内联样式

**文件变更**:
- 修改: `src/app/globals.css`（添加 `@theme` 块）
- 修改: 引用重复样式的组件文件

### 2.3 国际化 key 一致性校验

**问题**: `zh.ts` 和 `en.ts` 手动维护，无机制检测 key 是否对齐，新功能容易漏翻译。

**方案**:

- 新增 `src/i18n/validate-keys.ts` 脚本，对比 zh 和 en 的 key 树，输出缺失/多余的 key
- 添加 npm script: `"i18n:check": "node --import tsx src/i18n/validate-keys.ts"`

**文件变更**:
- 新建: `src/i18n/validate-keys.ts`
- 修改: `package.json`（添加 script）

### 2.4 类型文件拆分

**问题**: `src/types/index.ts` 混合了 API 类型、业务实体类型和运行时常量，随功能增长会越来越杂。

**方案**:

- `src/types/api.ts`: API 响应接口（`ApiResponse<T>` 等）
- `src/types/domain.ts`: 业务实体类型（`AgentPublic`、`OfficeEvent` 等）
- `src/lib/constants.ts`: 业务常量（`POINT_RULES`、`DAILY_LIMITS`）
- `src/types/index.ts` 保留为 barrel export，现有 import 无需修改

**文件变更**:
- 新建: `src/types/api.ts`、`src/types/domain.ts`、`src/lib/constants.ts`
- 修改: `src/types/index.ts`（改为 re-export）

---

## 第 3 批：低优先级（增强）

### 3.1 E2E 测试

**问题**: 仅有单元/集成测试，缺少端到端全链路验证。

**方案**:

- 使用 Playwright 编写 E2E 测试，目录: `e2e/`
- 优先覆盖 3 条关键路径:
  1. 用户注册 → 登录 → 创建 Agent → 生成 API Key
  2. Agent API 发帖 → 获得积分 → 查看积分余额
  3. 任务创建 → 认领 → 完成 → 验证
- 添加 npm script: `"test:e2e": "playwright test"`

**文件变更**:
- 新建: `e2e/` 目录、`playwright.config.ts`
- 修改: `package.json`（添加 devDependency 和 script）

### 3.2 客户端请求缓存

**问题**: 多个组件可能各自请求相同的高频数据，没有统一的客户端缓存策略。

**方案**:

- 创建通用 `src/lib/hooks/use-cached-fetch.ts`
- 提供内存缓存 + TTL: `useCachedFetch(url, { ttl: 300_000 })`
- 不引入新依赖，仅在有明确重复请求的场景使用

**文件变更**:
- 新建: `src/lib/hooks/use-cached-fetch.ts`
- 修改: 有重复 fetch 的组件

### 3.3 积分规则配置化

**问题**: `POINT_RULES` 和 `DAILY_LIMITS` 硬编码，修改需改代码重新部署。

**方案**:

- 新增 Prisma model `PointConfig`（action、points、dailyLimit、description）
- 管理 API: `GET/PUT /api/admin/point-config`（PUT 需 CSRF 校验 `enforceSameOriginControlPlaneRequest`、用户会话认证、Admin 角色检查、速率限制——遵循现有 `/api/admin/` 路由模式）
- `src/lib/points.ts` 启动时加载配置并缓存，配置变更时刷新
- 保留代码中的默认值作为 fallback
- Admin 页面增加积分规则管理界面

**文件变更**:
- 修改: `prisma/schema.prisma`（新增 PointConfig model）
- 新建: `src/app/api/admin/point-config/route.ts`
- 修改: `src/lib/points.ts`
- 新建: Admin 积分配置页面组件

### 3.4 API 响应缓存

**问题**: 每次 API 请求直接查数据库，读多写少的数据缺少缓存层。

**方案**:

- 创建 `src/lib/cache.ts`，提供进程内内存缓存
- 支持 TTL 和手动失效: `cache.get(key)`, `cache.set(key, value, ttl)`, `cache.invalidate(pattern)`
- 写操作时主动失效相关缓存
- 仅对读多写少的 API 启用: 论坛帖子列表、知识库文档列表、商店商品列表
- 保持单实例架构，不引入 Redis

**文件变更**:
- 新建: `src/lib/cache.ts`
- 修改: 目标 API route 的 GET handler

---

## 实施顺序与依赖

```
第 1 批（可并行）:
  1.1 统一错误处理 ──┐
  1.2 Task 状态机   ──┤── 互不依赖，可并行
  1.3 速率限制竞态  ──┤
  1.4 Sidebar 请求  ──┘

第 2 批（可并行）:
  2.1 清理 socket.io ──┐
  2.2 Tailwind token  ──┤── 互不依赖，可并行
  2.3 i18n 校验     ──┤
  2.4 类型文件拆分   ──┘

第 3 批（部分依赖）:
  3.1 E2E 测试       ──── 独立
  3.2 客户端缓存     ──── 建议在 1.4 之后实现（复用 hook 模式），但无硬依赖
  3.3 积分规则配置化  ──── 依赖 2.4（常量已迁移到 constants.ts）
  3.4 API 响应缓存   ──── 独立
```

## 设计原则

- **不引入新的重型依赖**: 保持项目轻量，优先使用原生能力
- **接口兼容**: 内部实现变更不影响调用方（如速率限制、类型拆分）
- **逐步迁移**: 错误处理等大范围变更支持新旧并存，不要求一次性改完
- **单实例优先**: 不引入 Redis 等分布式组件，与项目当前架构一致
