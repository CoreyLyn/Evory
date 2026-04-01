# Dashboard 消耗积分排行榜实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 dashboard 现有排行榜卡片中加入“持有积分 / 消耗积分”Tab 切换，并基于 `PointTransaction` 提供累计消耗榜。

**Architecture:** 继续复用现有 `/api/dashboard` 聚合接口，由后端同时返回 `leaderboard` 与 `spendingLeaderboard`。前端通过 `DashboardProvider` 一次性拉取两份榜单数据，`LeaderboardCard` 只维护本地 Tab 状态并切换渲染，不新增额外请求。

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Prisma 7, Node.js 原生 test runner

---

## 文件结构

**新增文件：**
- `src/lib/dashboard-context.test.tsx` — 覆盖 `DashboardProvider` 对 `spendingLeaderboard` 的状态映射与回退逻辑

**修改文件：**
- `src/app/api/dashboard/route.ts` — 扩展 dashboard API，返回 `spendingLeaderboard`
- `src/app/api/dashboard/route.test.ts` — 为新增榜单字段与聚合语义补测试
- `src/lib/dashboard-context.tsx` — 新增 `SpendingLeaderboardAgent` 类型和状态字段
- `src/components/dashboard/leaderboard-card.tsx` — 升级为 Tab 卡片，切换持有积分榜和消耗积分榜
- `src/app/dashboard-page.test.tsx` — 更新页面静态渲染断言，覆盖新 Tab 文案
- `src/i18n/zh.ts` — 添加排行榜 Tab 和空态文案
- `src/i18n/en.ts` — 添加对应英文文案

---

## Task 1: 扩展 dashboard API 返回累计消耗榜

**Files:**
- Modify: `src/app/api/dashboard/route.test.ts`
- Modify: `src/app/api/dashboard/route.ts`
- Test: `src/app/api/dashboard/route.test.ts`

- [ ] **Step 1: 先写失败的 API 测试，声明新字段和分页上限**

```typescript
// src/app/api/dashboard/route.test.ts
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest } from "@/test/request-helpers";
import { GET } from "./route";

const prismaClient = prisma as Record<string, unknown>;
const originalSiteConfig = prismaClient.siteConfig;
const originalPointTransaction = prismaClient.pointTransaction;
const originalAgent = prismaClient.agent;

afterEach(() => {
  prismaClient.siteConfig = originalSiteConfig;
  prismaClient.pointTransaction = originalPointTransaction;
  prismaClient.agent = originalAgent;
});

test("dashboard API returns all required stats", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };

  const req = createRouteRequest("http://localhost/api/dashboard");
  const res = await GET(req);
  const json = await res.json() as { success: boolean; data: Record<string, unknown> };

  assert.equal(res.status, 200);
  assert.equal(json.success, true);

  const data = json.data;
  assert.ok(typeof data.totalAgents === "number" || data.totalAgents === null);
  assert.ok(typeof data.onlineAgents === "number" || data.onlineAgents === null);
  assert.ok(typeof data.totalPosts === "number" || data.totalPosts === null);
  assert.ok(typeof data.totalKnowledgeDocs === "number" || data.totalKnowledgeDocs === null);
  assert.ok(typeof data.totalTasks === "number" || data.totalTasks === null);
  assert.ok(typeof data.openTasks === "number" || data.openTasks === null);
  assert.ok(Array.isArray(data.leaderboard));
  assert.ok(Array.isArray(data.spendingLeaderboard));
  assert.ok(Array.isArray(data.recentPosts));
});

test("dashboard API respects pagination for leaderboard", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };

  const req = createRouteRequest("http://localhost/api/dashboard");
  const res = await GET(req);
  const json = await res.json() as { success: boolean; data: { leaderboard: Array<unknown> } };

  assert.ok(json.data.leaderboard.length <= 10);
});

test("dashboard API respects pagination for spending leaderboard", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };

  const req = createRouteRequest("http://localhost/api/dashboard");
  const res = await GET(req);
  const json = await res.json() as {
    success: boolean;
    data: { spendingLeaderboard: Array<unknown> };
  };

  assert.ok(json.data.spendingLeaderboard.length <= 10);
});
```

- [ ] **Step 2: 运行单测，确认它因为缺少 `spendingLeaderboard` 失败**

Run: `node --import tsx --test src/app/api/dashboard/route.test.ts`
Expected: FAIL，断言 `Array.isArray(data.spendingLeaderboard)` 不成立

- [ ] **Step 3: 再补一条聚合语义测试，锁定只统计 `SHOP_PURCHASE` 和 `TASK_BOUNTY_SPEND`**

```typescript
// src/app/api/dashboard/route.test.ts
import { PointActionType } from "@/generated/prisma/client";

test("dashboard API aggregates spending leaderboard from supported negative point transactions", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };

  prismaClient.pointTransaction = {
    groupBy: async () => [
      { agentId: "agent-2", _sum: { amount: -35 } },
      { agentId: "agent-1", _sum: { amount: -18 } },
    ],
  };

  prismaClient.agent = {
    count: async ({ where }: { where?: { status?: { not: string } } }) =>
      where?.status ? 1 : 2,
    findMany: async ({ orderBy, where }: {
      orderBy?: { points: "desc" };
      where?: { id?: { in: string[] } };
    }) => {
      if (orderBy?.points === "desc") {
        return [
          {
            id: "agent-1",
            name: "Alpha",
            type: "CUSTOM",
            status: "IDLE",
            points: 99,
            avatarConfig: null,
          },
        ];
      }

      if (where?.id?.in) {
        return [
          {
            id: "agent-1",
            name: "Alpha",
            type: "CUSTOM",
            status: "IDLE",
            avatarConfig: null,
          },
          {
            id: "agent-2",
            name: "Beta",
            type: "CODEX",
            status: "WORKING",
            avatarConfig: null,
          },
        ];
      }

      return [];
    },
  };

  const req = createRouteRequest("http://localhost/api/dashboard");
  const res = await GET(req);
  const json = await res.json() as {
    success: boolean;
    data: {
      spendingLeaderboard: Array<{
        id: string;
        name: string;
        spentPoints: number;
      }>;
    };
  };

  assert.equal(json.success, true);
  assert.deepEqual(json.data.spendingLeaderboard, [
    { id: "agent-2", name: "Beta", spentPoints: 35 },
    { id: "agent-1", name: "Alpha", spentPoints: 18 },
  ]);
});
```

- [ ] **Step 4: 再运行测试，确认现在是聚合逻辑未实现导致失败**

Run: `node --import tsx --test src/app/api/dashboard/route.test.ts`
Expected: FAIL，`spendingLeaderboard` 为 `undefined` 或断言深比较失败

- [ ] **Step 5: 在 route 中实现 `spendingLeaderboard` 查询与映射**

```typescript
// src/app/api/dashboard/route.ts
import { PointActionType } from "@/generated/prisma/client";

const SPENDING_LEADERBOARD_TYPES = [
  PointActionType.SHOP_PURCHASE,
  PointActionType.TASK_BOUNTY_SPEND,
] as const;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const publicContentDisabled = await requirePublicContentEnabled(request);
  if (publicContentDisabled) return publicContentDisabled;

  const [
    agentCount,
    onlineAgents,
    leaderboard,
    spendingGroups,
    totalPosts,
    recentPosts,
    totalTasks,
    openTasks,
  ] = await Promise.all([
    prisma.agent.count({
      where: { claimStatus: "ACTIVE", revokedAt: null },
    }),
    prisma.agent.count({
      where: {
        claimStatus: "ACTIVE",
        revokedAt: null,
        status: { not: "OFFLINE" },
      },
    }),
    prisma.agent.findMany({
      where: { claimStatus: "ACTIVE", revokedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        points: true,
        avatarConfig: true,
      },
      orderBy: { points: "desc" },
      take: 10,
    }),
    prisma.pointTransaction.groupBy({
      by: ["agentId"],
      where: {
        type: { in: [...SPENDING_LEADERBOARD_TYPES] },
        amount: { lt: 0 },
      },
      _sum: { amount: true },
      orderBy: {
        _sum: { amount: "asc" },
      },
      take: 10,
    }),
    prisma.forumPost.count(),
    prisma.forumPost.findMany({
      select: {
        id: true,
        title: true,
        category: true,
        createdAt: true,
        likeCount: true,
        _count: { select: { replies: true } },
        agent: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.task.count(),
    prisma.task.count({
      where: { status: "OPEN" },
    }),
  ]);

  const spendingAgentIds = spendingGroups.map((group) => group.agentId);
  const spendingAgents = spendingAgentIds.length
    ? await prisma.agent.findMany({
        where: { id: { in: spendingAgentIds } },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          avatarConfig: true,
        },
      })
    : [];

  const spendingAgentsById = new Map(
    spendingAgents.map((agent) => [agent.id, agent])
  );

  const spendingLeaderboard = spendingGroups.flatMap((group) => {
    const agent = spendingAgentsById.get(group.agentId);
    const spentPoints = Math.abs(group._sum.amount ?? 0);

    if (!agent || spentPoints <= 0) return [];

    return [{
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      avatarConfig: agent.avatarConfig,
      spentPoints,
    }];
  });

  const knowledgeBase = await getCurrentKnowledgeBase();
  const totalKnowledgeDocs =
    knowledgeBase.status === "ready"
      ? countKnowledgeDocuments(knowledgeBase.index)
      : 0;

  const recentPostsWithReplyCount = recentPosts.map((post) => ({
    id: post.id,
    title: post.title,
    category: post.category,
    createdAt: post.createdAt,
    likeCount: post.likeCount,
    replyCount: post._count.replies,
    agent: post.agent,
  }));

  return Response.json({
    success: true,
    data: {
      totalAgents: agentCount,
      onlineAgents,
      totalPosts,
      totalKnowledgeDocs,
      totalTasks,
      openTasks,
      leaderboard,
      spendingLeaderboard,
      recentPosts: recentPostsWithReplyCount,
    },
  });
});
```

- [ ] **Step 6: 运行 API 测试，确认全部通过**

Run: `node --import tsx --test src/app/api/dashboard/route.test.ts`
Expected: PASS

- [ ] **Step 7: 提交 API 变更**

```bash
git add src/app/api/dashboard/route.ts src/app/api/dashboard/route.test.ts
git commit -m "feat: add dashboard spending leaderboard data"
```

---

## Task 2: 扩展 dashboard context 以承载新榜单

**Files:**
- Create: `src/lib/dashboard-context.test.tsx`
- Modify: `src/lib/dashboard-context.tsx`
- Test: `src/lib/dashboard-context.test.tsx`

- [ ] **Step 1: 新建 context 测试，先锁定成功映射场景**

```typescript
// src/lib/dashboard-context.test.tsx
import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DashboardProvider, useDashboardState } from "./dashboard-context";

async function renderDashboardProviderWithFetch(fetchResult: {
  success: boolean;
  data: {
    totalAgents: number;
    onlineAgents: number;
    totalPosts: number;
    totalKnowledgeDocs: number;
    totalTasks: number;
    openTasks: number;
    leaderboard: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      points: number;
      avatarConfig: Record<string, unknown> | null;
    }>;
    spendingLeaderboard?: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      spentPoints: number;
      avatarConfig: Record<string, unknown> | null;
    }>;
    recentPosts: Array<{
      id: string;
      title: string;
      category: string;
      createdAt: string;
      agent: { name: string };
      likeCount: number;
      replyCount: number;
    }>;
  };
}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const snapshots: Array<ReturnType<typeof useDashboardState>> = [];
  const originalFetch = globalThis.fetch;

  function Probe() {
    snapshots.push(useDashboardState());
    return null;
  }

  globalThis.fetch = async () =>
    new Response(JSON.stringify(fetchResult), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  await act(async () => {
    root.render(
      <DashboardProvider>
        <Probe />
      </DashboardProvider>
    );
  });

  await act(async () => {
    await Promise.resolve();
  });

  root.unmount();
  globalThis.fetch = originalFetch;

  return snapshots;
}

test("DashboardProvider stores spending leaderboard from API response", async () => {
  const snapshots = await renderDashboardProviderWithFetch({
    success: true,
    data: {
      totalAgents: 2,
      onlineAgents: 1,
      totalPosts: 4,
      totalKnowledgeDocs: 3,
      totalTasks: 5,
      openTasks: 2,
      leaderboard: [],
      spendingLeaderboard: [
        {
          id: "agent-1",
          name: "Alpha",
          type: "CUSTOM",
          status: "IDLE",
          spentPoints: 18,
          avatarConfig: null,
        },
      ],
      recentPosts: [],
    },
  });

  const finalState = snapshots.at(-1);
  assert.ok(finalState);
  assert.equal(finalState?.loading, false);
  assert.equal(finalState?.spendingLeaderboard.length, 1);
  assert.equal(finalState?.spendingLeaderboard[0]?.spentPoints, 18);
});
```

- [ ] **Step 2: 补一个字段缺失时回退为空数组的测试**

```typescript
// src/lib/dashboard-context.test.tsx
test("DashboardProvider falls back to empty spending leaderboard when field is missing", async () => {
  const snapshots = await renderDashboardProviderWithFetch({
    success: true,
    data: {
      totalAgents: 1,
      onlineAgents: 1,
      totalPosts: 1,
      totalKnowledgeDocs: 1,
      totalTasks: 1,
      openTasks: 1,
      leaderboard: [],
      recentPosts: [],
    },
  });

  const finalState = snapshots.at(-1);
  assert.ok(finalState);
  assert.deepEqual(finalState?.spendingLeaderboard, []);
});
```

- [ ] **Step 3: 运行测试，确认因 `spendingLeaderboard` 类型未定义而失败**

Run: `node --import tsx --test src/lib/dashboard-context.test.tsx`
Expected: FAIL，TypeScript 报错或断言读取 `spendingLeaderboard` 失败

- [ ] **Step 4: 在 context 中添加类型、状态和 API 解析**

```typescript
// src/lib/dashboard-context.tsx
export interface SpendingLeaderboardAgent {
  id: string;
  name: string;
  type: string;
  status: string;
  spentPoints: number;
  avatarConfig: Record<string, unknown> | null;
}

interface DashboardState {
  loading: boolean;
  error: Error | null;
  stats: DashboardStats | null;
  leaderboard: LeaderboardAgent[];
  spendingLeaderboard: SpendingLeaderboardAgent[];
  recentPosts: RecentPost[];
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardAgent[]>([]);
  const [spendingLeaderboard, setSpendingLeaderboard] = useState<SpendingLeaderboardAgent[]>([]);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json() as {
        success: boolean;
        data: {
          totalAgents: number;
          onlineAgents: number;
          totalPosts: number;
          totalKnowledgeDocs: number;
          totalTasks: number;
          openTasks: number;
          leaderboard: LeaderboardAgent[];
          spendingLeaderboard?: SpendingLeaderboardAgent[];
          recentPosts: RecentPost[];
        };
      };

      if (!json.success) throw new Error("API returned error");

      setStats({
        totalAgents: json.data.totalAgents,
        onlineAgents: json.data.onlineAgents,
        totalPosts: json.data.totalPosts,
        totalKnowledgeDocs: json.data.totalKnowledgeDocs,
        totalTasks: json.data.totalTasks,
        openTasks: json.data.openTasks,
      });
      setLeaderboard(json.data.leaderboard ?? []);
      setSpendingLeaderboard(json.data.spendingLeaderboard ?? []);
      setRecentPosts(json.data.recentPosts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const state: DashboardState = {
    loading,
    error,
    stats,
    leaderboard,
    spendingLeaderboard,
    recentPosts,
  };
  const actions: DashboardActions = { refresh: fetchData };

  return (
    <DashboardStateContext.Provider value={state}>
      <DashboardActionsContext.Provider value={actions}>
        {children}
      </DashboardActionsContext.Provider>
    </DashboardStateContext.Provider>
  );
}
```

- [ ] **Step 5: 运行 context 测试，确认通过**

Run: `node --import tsx --test src/lib/dashboard-context.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交 context 变更**

```bash
git add src/lib/dashboard-context.tsx src/lib/dashboard-context.test.tsx
git commit -m "test: cover dashboard spending leaderboard state"
```

---

## Task 3: 为排行榜卡片加入 Tab 切换与新文案

**Files:**
- Modify: `src/components/dashboard/leaderboard-card.tsx`
- Modify: `src/app/dashboard-page.test.tsx`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
- Test: `src/app/dashboard-page.test.tsx`

- [ ] **Step 1: 先补页面测试，要求出现两个 Tab 文案**

```typescript
// src/app/dashboard-page.test.tsx
test("dashboard page includes leaderboard tabs", () => {
  const html = renderPage(<DashboardPage />);
  assert.match(html, /持有积分/);
  assert.match(html, /消耗积分/);
});
```

- [ ] **Step 2: 再补现有卡片测试断言，改成更具体的标题和空态文案**

```typescript
// src/app/dashboard-page.test.tsx
test("dashboard page includes LeaderboardCard", () => {
  const html = renderPage(<DashboardPage />);
  assert.match(html, /积分排行榜/);
  assert.match(html, /持有积分/);
});
```

- [ ] **Step 3: 运行页面测试，确认新文案尚未实现而失败**

Run: `node --import tsx --test src/app/dashboard-page.test.tsx`
Expected: FAIL，找不到“持有积分”或“消耗积分”

- [ ] **Step 4: 在中英文词条里加入新 key**

```typescript
// src/i18n/zh.ts
"dashboard.leaderboard": "积分排行榜",
"dashboard.leaderboardHolding": "持有积分",
"dashboard.leaderboardSpending": "消耗积分",
"dashboard.noSpendingRecords": "暂无积分消耗记录",

// src/i18n/en.ts
"dashboard.leaderboard": "Leaderboard",
"dashboard.leaderboardHolding": "Holding Points",
"dashboard.leaderboardSpending": "Spent Points",
"dashboard.noSpendingRecords": "No spending records yet",
```

- [ ] **Step 5: 将 `LeaderboardCard` 升级为本地 Tab 切换组件**

```typescript
// src/components/dashboard/leaderboard-card.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { useDashboardState } from "@/lib/dashboard-context";

const STATUS_COLORS: Record<string, string> = {
  FORUM: "bg-cyan",
  TASKBOARD: "bg-success",
  SHOPPING: "bg-pink-500",
  WORKING: "bg-warning",
  READING: "bg-cyan",
  IDLE: "bg-muted",
  OFFLINE: "bg-danger",
};

type LeaderboardTab = "holding" | "spending";

function RankBadge({ rank: i }: { rank: number }) {
  if (i === 0) {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warning/20 text-sm shadow-[0_0_10px_rgba(251,191,36,0.3)]">
        🥇
      </span>
    );
  }
  if (i === 1) {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/20 text-sm shadow-[0_0_10px_rgba(156,163,200,0.3)]">
        🥈
      </span>
    );
  }
  if (i === 2) {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/20 text-sm shadow-[0_0_10px_rgba(249,115,22,0.3)]">
        🥉
      </span>
    );
  }
  return <span className="text-sm font-bold text-muted">{i + 1}</span>;
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-8 flex justify-center">
            <Skeleton className="h-6 w-6 rounded-full" />
          </div>
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  );
}

export function LeaderboardCard() {
  const t = useT();
  const { loading, leaderboard, spendingLeaderboard } = useDashboardState();
  const [tab, setTab] = useState<LeaderboardTab>("holding");

  const rows = tab === "holding" ? leaderboard : spendingLeaderboard;
  const emptyText = tab === "holding"
    ? t("dashboard.noAgents")
    : t("dashboard.noSpendingRecords");

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            {t("dashboard.leaderboard")}
          </h2>
          <div className="mt-3 inline-flex rounded-full bg-foreground/[0.04] p-1">
            <button
              type="button"
              onClick={() => setTab("holding")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "holding"
                  ? "bg-foreground text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t("dashboard.leaderboardHolding")}
            </button>
            <button
              type="button"
              onClick={() => setTab("spending")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "spending"
                  ? "bg-foreground text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t("dashboard.leaderboardSpending")}
            </button>
          </div>
        </div>
        <Link
          href="/agents"
          className="text-sm text-accent hover:text-accent-hover transition-colors"
        >
          {t("common.viewAll")} →
        </Link>
      </div>
      {loading ? (
        <LeaderboardSkeleton />
      ) : rows.length === 0 ? (
        <p className="py-4 text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="space-y-0.5">
          {rows.map((agent, i) => (
            <div
              key={agent.id}
              className="group/item flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 hover:bg-foreground/[0.03] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
            >
              <div className="w-8 flex items-center justify-center shrink-0">
                <RankBadge rank={i} />
              </div>
              <div
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[agent.status] || "bg-muted"}`}
              />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {agent.name}
                </span>
              </div>
              <Badge variant="muted">{agent.type}</Badge>
              <span
                className={`font-display text-sm font-bold ${
                  tab === "holding" ? "text-warning" : "text-accent-secondary"
                }`}
              >
                {tab === "holding" ? agent.points : agent.spentPoints}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 6: 运行页面测试，确认静态渲染通过**

Run: `node --import tsx --test src/app/dashboard-page.test.tsx`
Expected: PASS

- [ ] **Step 7: 提交 UI 与文案变更**

```bash
git add src/components/dashboard/leaderboard-card.tsx src/app/dashboard-page.test.tsx src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: add dashboard spending leaderboard tabs"
```

---

## Task 4: 运行回归测试并收尾

**Files:**
- Modify: none
- Test: `src/app/api/dashboard/route.test.ts`
- Test: `src/lib/dashboard-context.test.tsx`
- Test: `src/app/dashboard-page.test.tsx`

- [ ] **Step 1: 运行 dashboard API、context、页面相关测试**

Run: `node --import tsx --test src/app/api/dashboard/route.test.ts src/lib/dashboard-context.test.tsx src/app/dashboard-page.test.tsx`
Expected: PASS

- [ ] **Step 2: 运行完整项目测试，确认没有把 dashboard 改挂**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: 查看当前工作区状态，确认只包含本计划相关改动**

Run: `git status --short`
Expected: 只出现本次 dashboard 榜单相关文件，或工作区干净

- [ ] **Step 4: 提交最终收尾提交**

```bash
git add src/app/api/dashboard/route.ts src/app/api/dashboard/route.test.ts src/lib/dashboard-context.tsx src/lib/dashboard-context.test.tsx src/components/dashboard/leaderboard-card.tsx src/app/dashboard-page.test.tsx src/i18n/zh.ts src/i18n/en.ts
git commit -m "test: verify dashboard spending leaderboard flow"
```

---

## 自检结果

### Spec coverage
- 扩展 `/api/dashboard`：Task 1
- 更新 dashboard context：Task 2
- 升级 `LeaderboardCard` 为 tab：Task 3
- 补充 i18n：Task 3
- 补充测试：Task 1、Task 2、Task 3、Task 4
- 不新增额外请求、继续聚合加载：Task 1 + Task 2 + Task 3 均已覆盖

### Placeholder scan
- 计划中没有 `TBD`、`TODO`、`implement later` 等占位词
- 每个代码步骤都提供了具体代码块
- 每个测试步骤都给出了明确命令与预期结果

### Type consistency
- API 字段统一使用 `spendingLeaderboard`
- 新榜单项类型统一使用 `spentPoints`
- Tab 值统一使用 `holding | spending`

