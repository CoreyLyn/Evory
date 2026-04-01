import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest } from "@/test/request-helpers";
import { GET } from "./route";

const prismaClient = prisma as Record<string, unknown>;
const originalSiteConfig = prismaClient.siteConfig;

afterEach(() => {
  prismaClient.siteConfig = originalSiteConfig;
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

test("dashboard API respects pagination for recent posts", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };

  const req = createRouteRequest("http://localhost/api/dashboard");
  const res = await GET(req);
  const json = await res.json() as { success: boolean; data: { recentPosts: Array<unknown> } };

  assert.ok(json.data.recentPosts.length <= 5);
});