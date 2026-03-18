import assert from "node:assert/strict";
import test from "node:test";

import { loadDashboardData } from "./dashboard-data";

type MockResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

function createKnowledgeTreeResponse(documentCount: number) {
  return {
    success: true,
    meta: {
      totalDocuments: documentCount,
    },
    data: {
      path: "",
      name: "",
      title: "Knowledge Base",
      document: documentCount > 0 ? { path: "", title: "Knowledge Home" } : null,
      directories: [],
      documents: [],
    },
  };
}

test("loadDashboardData reads knowledge document totals from tree metadata", async () => {
  const result = await loadDashboardData(
    createFetcher({
      "/api/agents/list?pageSize=100": {
        success: true,
        data: {
          agents: [],
          pagination: { total: 0 },
        },
      },
      "/api/agents/leaderboard": { success: true, data: [] },
      "/api/forum/posts?pageSize=5": {
        success: true,
        data: [],
        pagination: { total: 0 },
      },
      "/api/knowledge/tree": {
        success: true,
        meta: { totalDocuments: 12 },
        data: {
          path: "",
          name: "",
          title: "Knowledge Base",
          document: null,
          directories: [],
          documents: [],
        },
      },
      "/api/tasks?pageSize=1": {
        success: true,
        data: [],
        pagination: { total: 0 },
      },
      "/api/tasks?status=OPEN&pageSize=1": {
        success: true,
        data: [],
        pagination: { total: 0 },
      },
    })
  );

  assert.equal(result.stats.totalKnowledgeDocs, 12);
});

function createFetcher(routes: Record<string, unknown>) {
  return async (input: string): Promise<MockResponse> => {
    if (!(input in routes)) {
      throw new Error(`Unexpected request: ${input}`);
    }

    const route = routes[input];

    if (route instanceof Error) {
      throw route;
    }

    return {
      ok: true,
      json: async () => route,
    };
  };
}

test("loadDashboardData reads forum posts from array data and top-level pagination", async () => {
  const result = await loadDashboardData(
    createFetcher({
      "/api/agents/list?pageSize=100": {
        success: true,
        data: {
          agents: [
            { id: "a-1", name: "Alpha", status: "TASKBOARD" },
            { id: "a-2", name: "Beta", status: "OFFLINE" },
          ],
          pagination: { total: 2 },
        },
      },
      "/api/agents/leaderboard": {
        success: true,
        data: [{ id: "a-1", name: "Alpha", status: "TASKBOARD", points: 10 }],
      },
      "/api/forum/posts?pageSize=5": {
        success: true,
        data: [
          {
            id: "p-1",
            title: "Hello",
            category: "general",
            createdAt: "2026-03-07T00:00:00.000Z",
            likeCount: 3,
            replyCount: 2,
            agent: { name: "Alpha" },
          },
        ],
        pagination: { total: 6 },
      },
      "/api/knowledge/tree": createKnowledgeTreeResponse(4),
      "/api/tasks?pageSize=1": {
        success: true,
        data: [],
        pagination: { total: 9 },
      },
      "/api/tasks?status=OPEN&pageSize=1": {
        success: true,
        data: [],
        pagination: { total: 3 },
      },
    })
  );

  assert.equal(result.stats?.totalAgents, 2);
  assert.equal(result.stats?.onlineAgents, 1);
  assert.equal(result.stats?.totalPosts, 6);
  assert.equal(result.stats?.totalKnowledgeDocs, 4);
  assert.equal(result.stats?.totalTasks, 9);
  assert.equal(result.stats?.openTasks, 3);
  assert.equal(result.recentPosts.length, 1);
  assert.equal(result.recentPosts[0]?.title, "Hello");
  assert.equal(result.recentPosts[0]?.replyCount, 2);
});

test("loadDashboardData keeps healthy sections when an extra stats request fails", async () => {
  const result = await loadDashboardData(
    createFetcher({
      "/api/agents/list?pageSize=100": new Error("Connection terminated unexpectedly"),
      "/api/agents/leaderboard": {
        success: true,
        data: [{ id: "a-1", name: "Alpha", status: "TASKBOARD", points: 10 }],
      },
      "/api/forum/posts?pageSize=5": {
        success: true,
        data: [
          {
            id: "p-1",
            title: "Hello",
            category: "general",
            createdAt: "2026-03-07T00:00:00.000Z",
            likeCount: 3,
            replyCount: 2,
            agent: { name: "Alpha" },
          },
        ],
        pagination: { total: 6 },
      },
      "/api/knowledge/tree": new Error("Knowledge tree unavailable"),
      "/api/tasks?pageSize=1": {
        success: true,
        data: [],
        pagination: { total: 7 },
      },
      "/api/tasks?status=OPEN&pageSize=1": {
        success: true,
        data: [],
        pagination: { total: 2 },
      },
    })
  );

  assert.equal(result.stats?.totalAgents, null);
  assert.equal(result.stats?.onlineAgents, null);
  assert.equal(result.stats?.totalPosts, 6);
  assert.equal(result.stats?.totalKnowledgeDocs, null);
  assert.equal(result.stats?.totalTasks, 7);
  assert.equal(result.stats?.openTasks, 2);
  assert.equal(result.leaderboard.length, 1);
  assert.equal(result.recentPosts.length, 1);
});

test("loadDashboardData times out a hanging request without blocking other sections", async () => {
  const result = await loadDashboardData(
    async (input: string): Promise<MockResponse> => {
      if (input === "/api/agents/list?pageSize=100") {
        return new Promise(() => undefined);
      }

      return createFetcher({
        "/api/agents/leaderboard": {
          success: true,
          data: [{ id: "a-1", name: "Alpha", status: "TASKBOARD", points: 10 }],
        },
        "/api/forum/posts?pageSize=5": {
          success: true,
          data: [
            {
              id: "p-1",
              title: "Hello",
              category: "general",
              createdAt: "2026-03-07T00:00:00.000Z",
              likeCount: 3,
              replyCount: 2,
              agent: { name: "Alpha" },
            },
          ],
          pagination: { total: 6 },
        },
        "/api/knowledge/tree": createKnowledgeTreeResponse(8),
        "/api/tasks?pageSize=1": {
          success: true,
          data: [],
          pagination: { total: 5 },
        },
        "/api/tasks?status=OPEN&pageSize=1": {
          success: true,
          data: [],
          pagination: { total: 1 },
        },
      })(input);
    },
    { timeoutMs: 10 }
  );

  assert.equal(result.stats?.totalAgents, null);
  assert.equal(result.stats?.totalPosts, 6);
  assert.equal(result.stats?.totalKnowledgeDocs, 8);
  assert.equal(result.stats?.totalTasks, 5);
  assert.equal(result.stats?.openTasks, 1);
  assert.equal(result.leaderboard.length, 1);
  assert.equal(result.recentPosts.length, 1);
});

test("loadDashboardData retries once after a transient failure", async () => {
  const calls = new Map<string, number>();
  const stableRoutes = {
    "/api/agents/list?pageSize=100": {
      success: true,
      data: {
        agents: [
          { id: "a-1", name: "Alpha", status: "TASKBOARD" },
          { id: "a-2", name: "Beta", status: "OFFLINE" },
        ],
        pagination: { total: 2 },
      },
    },
    "/api/agents/leaderboard": {
      success: true,
      data: [{ id: "a-1", name: "Alpha", status: "TASKBOARD", points: 10 }],
    },
    "/api/forum/posts?pageSize=5": {
      success: true,
      data: [
        {
          id: "p-1",
          title: "Hello",
          category: "general",
          createdAt: "2026-03-07T00:00:00.000Z",
          likeCount: 3,
          replyCount: 2,
          agent: { name: "Alpha" },
        },
      ],
      pagination: { total: 6 },
    },
    "/api/knowledge/tree": createKnowledgeTreeResponse(11),
    "/api/tasks?pageSize=1": {
      success: true,
      data: [],
      pagination: { total: 13 },
    },
    "/api/tasks?status=OPEN&pageSize=1": {
      success: true,
      data: [],
      pagination: { total: 4 },
    },
  } satisfies Record<string, unknown>;

  const result = await loadDashboardData(async (input: string) => {
    const attempt = (calls.get(input) ?? 0) + 1;
    calls.set(input, attempt);

    if (attempt === 1) {
      throw new Error(`Transient failure: ${input}`);
    }

    return {
      ok: true,
      json: async () => stableRoutes[input],
    };
  });

  assert.equal(result.stats.totalAgents, 2);
  assert.equal(result.stats.totalPosts, 6);
  assert.equal(result.stats.totalKnowledgeDocs, 11);
  assert.equal(result.stats.totalTasks, 13);
  assert.equal(result.stats.openTasks, 4);
  assert.equal(result.leaderboard.length, 1);
  assert.equal(result.recentPosts.length, 1);
});

test("loadDashboardData avoids overlapping homepage requests in concurrency-constrained environments", async () => {
  let activeRequests = 0;
  let maxActiveRequests = 0;

  const routes = {
    "/api/agents/list?pageSize=100": {
      success: true,
      data: {
        agents: [
          { id: "a-1", name: "Alpha", status: "TASKBOARD" },
          { id: "a-2", name: "Beta", status: "OFFLINE" },
        ],
        pagination: { total: 2 },
      },
    },
    "/api/agents/leaderboard": {
      success: true,
      data: [{ id: "a-1", name: "Alpha", status: "TASKBOARD", points: 10 }],
    },
    "/api/forum/posts?pageSize=5": {
      success: true,
      data: [
        {
          id: "p-1",
          title: "Hello",
          category: "general",
          createdAt: "2026-03-07T00:00:00.000Z",
          likeCount: 3,
          replyCount: 2,
          agent: { name: "Alpha" },
        },
      ],
      pagination: { total: 6 },
    },
    "/api/knowledge/tree": createKnowledgeTreeResponse(10),
    "/api/tasks?pageSize=1": {
      success: true,
      data: [],
      pagination: { total: 14 },
    },
    "/api/tasks?status=OPEN&pageSize=1": {
      success: true,
      data: [],
      pagination: { total: 6 },
    },
  } satisfies Record<string, unknown>;

  const result = await loadDashboardData(async (input: string) => {
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

    assert.ok(input in routes, `Unexpected request: ${input}`);
    assert.equal(activeRequests, 1, `Overlapping request detected for ${input}`);

    await new Promise((resolve) => setTimeout(resolve, 10));
    activeRequests -= 1;

    return {
      ok: true,
      json: async () => routes[input],
    };
  });

  assert.equal(maxActiveRequests, 1);
  assert.equal(result.stats.totalAgents, 2);
  assert.equal(result.stats.totalPosts, 6);
  assert.equal(result.stats.totalKnowledgeDocs, 10);
  assert.equal(result.stats.totalTasks, 14);
  assert.equal(result.stats.openTasks, 6);
  assert.equal(result.leaderboard.length, 1);
  assert.equal(result.recentPosts.length, 1);
});
