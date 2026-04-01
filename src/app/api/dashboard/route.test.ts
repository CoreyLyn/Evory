import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest } from "@/test/request-helpers";
import { GET } from "./route";

type DashboardStatsResponse = {
  success: boolean;
  data: {
    totalAgents: number | null;
    onlineAgents: number | null;
    totalPosts: number | null;
    totalKnowledgeDocs: number | null;
    totalTasks: number | null;
    openTasks: number | null;
    leaderboard: Array<unknown>;
    spendingLeaderboard: Array<SpendingLeaderboardEntry>;
    recentPosts: Array<unknown>;
  };
};

type SpendingLeaderboardEntry = {
  id: string;
  name: string;
  type: string;
  status: string;
  avatarConfig: { seed: string } | null;
  spentPoints: number;
};

type SpendingGroupByArgs = {
  by: string[];
  where: {
    type: { in: string[] };
    amount: { lt: number };
  };
  _sum: { amount: true };
  orderBy: { _sum: { amount: "asc" | "desc" } };
  take: number;
};

type SpendingGroupByRow = {
  agentId: string | null;
  _sum: { amount: number | null };
};

type SpendingAgentLookupArgs = {
  where?: { id?: { in?: string[] } };
};

type DashboardAgentLeaderboardRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  points: number;
  avatarConfig: { seed: string } | null;
};

type SpendingAgentLookupRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  avatarConfig: { seed: string } | null;
};

type DashboardPrismaMock = {
  siteConfig?: {
    findFirst: (args?: unknown) => Promise<unknown>;
  };
  agent: {
    count: (args?: unknown) => Promise<number>;
    findMany: (
      args?: SpendingAgentLookupArgs | { orderBy?: { points: "desc" } }
    ) => Promise<Array<DashboardAgentLeaderboardRow | SpendingAgentLookupRow>>;
  };
  forumPost: {
    count: (args?: unknown) => Promise<number>;
    findMany: (args?: unknown) => Promise<Array<unknown>>;
  };
  task: {
    count: (args?: unknown) => Promise<number>;
  };
  pointTransaction: {
    groupBy: (args?: SpendingGroupByArgs) => Promise<SpendingGroupByRow[]>;
  };
};

const prismaClient = prisma as unknown as DashboardPrismaMock;
const originalSiteConfig = prismaClient.siteConfig;
const originalAgentCount = prismaClient.agent.count;
const originalAgentFindMany = prismaClient.agent.findMany;
const originalForumPostCount = prismaClient.forumPost.count;
const originalForumPostFindMany = prismaClient.forumPost.findMany;
const originalTaskCount = prismaClient.task.count;
const originalPointTransactionGroupBy = prismaClient.pointTransaction.groupBy;

function installDefaultDashboardMocks() {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  prismaClient.agent.count = async () => 0;
  prismaClient.agent.findMany = async (args?: SpendingAgentLookupArgs | { orderBy?: { points: "desc" } }) => {
    if ("where" in (args ?? {}) && args?.where?.id?.in) {
      return [];
    }

    return [];
  };
  prismaClient.forumPost.count = async () => 0;
  prismaClient.forumPost.findMany = async () => [];
  prismaClient.task.count = async () => 0;
  prismaClient.pointTransaction.groupBy = async () => [];
}

afterEach(() => {
  prismaClient.siteConfig = originalSiteConfig;
  prismaClient.agent.count = originalAgentCount;
  prismaClient.agent.findMany = originalAgentFindMany;
  prismaClient.forumPost.count = originalForumPostCount;
  prismaClient.forumPost.findMany = originalForumPostFindMany;
  prismaClient.task.count = originalTaskCount;
  prismaClient.pointTransaction.groupBy = originalPointTransactionGroupBy;
});

test("dashboard API returns all required stats", async () => {
  installDefaultDashboardMocks();

  const req = createRouteRequest("http://localhost/api/dashboard");
  const res = await GET(req);
  const json = (await res.json()) as DashboardStatsResponse;

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
  assert.ok(Array.isArray(data.recentPosts));
  assert.ok(Array.isArray(data.spendingLeaderboard));
});

test("dashboard API respects pagination for leaderboard", async () => {
  installDefaultDashboardMocks();

  const req = createRouteRequest("http://localhost/api/dashboard");
  const res = await GET(req);
  const json = (await res.json()) as DashboardStatsResponse;

  assert.ok(json.data.leaderboard.length <= 10);
  assert.ok(json.data.spendingLeaderboard.length <= 10);
});

test("dashboard API respects pagination for recent posts", async () => {
  installDefaultDashboardMocks();

  const req = createRouteRequest("http://localhost/api/dashboard");
  const res = await GET(req);
  const json = (await res.json()) as DashboardStatsResponse;

  assert.ok(json.data.recentPosts.length <= 5);
});

test("dashboard API returns spending leaderboard aggregated from supported negative transactions", async () => {
  installDefaultDashboardMocks();

  let capturedGroupByArgs: SpendingGroupByArgs | undefined;

  prismaClient.pointTransaction.groupBy = async (args?: SpendingGroupByArgs) => {
    capturedGroupByArgs = args;
    return [
      {
        agentId: "agent_2",
        _sum: { amount: -320 },
      },
      {
        agentId: "agent_1",
        _sum: { amount: -180 },
      },
    ];
  };

  prismaClient.agent.findMany = async (args?: SpendingAgentLookupArgs | { orderBy?: { points: "desc" } }) => {
    if ("where" in (args ?? {}) && args?.where?.id?.in) {
      return [
        {
          id: "agent_1",
          name: "Agent One",
          type: "assistant",
          status: "ACTIVE",
          avatarConfig: { seed: "one" },
          points: 0,
        },
        {
          id: "agent_2",
          name: "Agent Two",
          type: "operator",
          status: "IDLE",
          avatarConfig: { seed: "two" },
          points: 0,
        },
      ];
    }

    return [];
  };

  const req = createRouteRequest("http://localhost/api/dashboard");
  const res = await GET(req);
  const json = (await res.json()) as DashboardStatsResponse;

  assert.equal(res.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(capturedGroupByArgs?.by, ["agentId"]);
  assert.deepEqual(capturedGroupByArgs?.where.type.in.sort(), [
    "SHOP_PURCHASE",
    "TASK_BOUNTY_SPEND",
  ]);
  assert.equal(capturedGroupByArgs?.where.amount.lt, 0);
  assert.equal(capturedGroupByArgs?.take, 10);
  assert.deepEqual(json.data.spendingLeaderboard, [
    {
      id: "agent_2",
      name: "Agent Two",
      type: "operator",
      status: "IDLE",
      avatarConfig: { seed: "two" },
      spentPoints: 320,
    },
    {
      id: "agent_1",
      name: "Agent One",
      type: "assistant",
      status: "ACTIVE",
      avatarConfig: { seed: "one" },
      spentPoints: 180,
    },
  ]);
});
