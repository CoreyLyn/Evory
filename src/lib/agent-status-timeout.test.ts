import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  scanExpiredAgentStatuses,
  STATUS_TIMEOUT_MS,
  SCAN_INTERVAL_MS,
  startStatusTimeoutScanner,
  stopStatusTimeoutScanner,
  resetAgentStatusTimeoutForTest,
} from "./agent-status-timeout";
import { resetLiveEventsForTest } from "./live-events";

// ── Prisma mock types ──

type FindManyArgs = {
  where: Record<string, unknown>;
  select: Record<string, boolean>;
};

type UpdateManyArgs = {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
};

type ActivityCreateArgs = {
  data: {
    agentId: string;
    type: string;
    summary: string;
    metadata: Record<string, unknown>;
  };
};

type PrismaMock = {
  agent: {
    findMany: (args: FindManyArgs) => Promise<unknown[]>;
    updateMany: (args: UpdateManyArgs) => Promise<{ count: number }>;
  };
  agentActivity: {
    create: (args: ActivityCreateArgs) => Promise<unknown>;
  };
};

const db = prisma as unknown as PrismaMock;
const originalFindMany = db.agent.findMany;
const originalUpdateMany = db.agent.updateMany;
const originalActivityCreate = db.agentActivity.create;

beforeEach(() => {
  resetLiveEventsForTest();
  resetAgentStatusTimeoutForTest();
});

afterEach(() => {
  resetAgentStatusTimeoutForTest();
  db.agent.findMany = originalFindMany;
  db.agent.updateMany = originalUpdateMany;
  db.agentActivity.create = originalActivityCreate;
});

test("STATUS_TIMEOUT_MS is 30 minutes", () => {
  assert.equal(STATUS_TIMEOUT_MS, 30 * 60 * 1000);
});

test("SCAN_INTERVAL_MS is 5 minutes", () => {
  assert.equal(SCAN_INTERVAL_MS, 5 * 60 * 1000);
});

test("scanExpiredAgentStatuses updates expired agents to OFFLINE", async () => {
  const expiredAgents = [
    { id: "agent-1", name: "Agent1", type: "CUSTOM", status: "WORKING", points: 10, avatarConfig: {}, bio: "", createdAt: new Date(), updatedAt: new Date() },
    { id: "agent-2", name: "Agent2", type: "CUSTOM", status: "ONLINE", points: 5, avatarConfig: {}, bio: "", createdAt: new Date(), updatedAt: new Date() },
  ];

  db.agent.findMany = async () => expiredAgents;
  db.agent.updateMany = async () => ({ count: 2 });
  db.agentActivity.create = async () => ({});

  const count = await scanExpiredAgentStatuses();

  assert.equal(count, 2);
});

test("scanExpiredAgentStatuses returns 0 when no agents are expired", async () => {
  db.agent.findMany = async () => [];

  const count = await scanExpiredAgentStatuses();

  assert.equal(count, 0);
});

test("scanExpiredAgentStatuses uses same WHERE condition for findMany and updateMany", async () => {
  let findWhere: Record<string, unknown> | null = null;
  let updateWhere: Record<string, unknown> | null = null;

  db.agent.findMany = async (args: FindManyArgs) => {
    findWhere = args.where;
    return [{ id: "agent-1", name: "A", type: "CUSTOM", status: "ONLINE", points: 0, avatarConfig: {}, bio: "", createdAt: new Date(), updatedAt: new Date() }];
  };
  db.agent.updateMany = async (args: UpdateManyArgs) => {
    updateWhere = args.where;
    return { count: 1 };
  };
  db.agentActivity.create = async () => ({});

  await scanExpiredAgentStatuses();

  assert.ok(findWhere);
  assert.ok(updateWhere);
  // Both should filter on status != OFFLINE and statusExpiresAt < now
  assert.deepEqual(Object.keys(findWhere!).sort(), Object.keys(updateWhere!).sort());
  assert.deepEqual(findWhere!.status, updateWhere!.status);
  // Both should have statusExpiresAt with lt condition
  assert.ok((findWhere!.statusExpiresAt as Record<string, unknown>).lt);
  assert.ok((updateWhere!.statusExpiresAt as Record<string, unknown>).lt);
});

test("scanExpiredAgentStatuses records STATUS_CHANGED activity with timeout source", async () => {
  const activities: ActivityCreateArgs["data"][] = [];

  db.agent.findMany = async () => [
    { id: "agent-1", name: "A", type: "CUSTOM", status: "WORKING", points: 0, avatarConfig: {}, bio: "", createdAt: new Date(), updatedAt: new Date() },
  ];
  db.agent.updateMany = async () => ({ count: 1 });
  db.agentActivity.create = async (args: ActivityCreateArgs) => {
    activities.push(args.data);
    return {};
  };

  await scanExpiredAgentStatuses();

  assert.equal(activities.length, 1);
  assert.equal(activities[0].agentId, "agent-1");
  assert.equal(activities[0].type, "STATUS_CHANGED");
  assert.equal((activities[0].metadata as Record<string, unknown>).source, "timeout");
  assert.equal((activities[0].metadata as Record<string, unknown>).previousStatus, "WORKING");
  assert.equal((activities[0].metadata as Record<string, unknown>).newStatus, "OFFLINE");
});

test("startStatusTimeoutScanner and stopStatusTimeoutScanner manage timer lifecycle", () => {
  startStatusTimeoutScanner();
  // calling start again should not throw or create duplicate
  startStatusTimeoutScanner();

  stopStatusTimeoutScanner();
  // calling stop again should not throw
  stopStatusTimeoutScanner();
});
