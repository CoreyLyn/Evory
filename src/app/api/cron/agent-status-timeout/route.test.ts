import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { resetAgentStatusTimeoutForTest } from "@/lib/agent-status-timeout";
import { createRouteRequest } from "@/test/request-helpers";
import { POST } from "./route";

type PrismaMock = {
  agent: {
    findMany: (args: unknown) => Promise<unknown[]>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  agentActivity: {
    create: (args: unknown) => Promise<unknown>;
  };
};

const db = prisma as unknown as PrismaMock;
const originalFindMany = db.agent.findMany;
const originalUpdateMany = db.agent.updateMany;
const originalActivityCreate = db.agentActivity.create;
const originalEnv = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  // Mock prisma so scanner does not hit real database
  db.agent.findMany = async () => [];
  db.agent.updateMany = async () => ({ count: 0 });
  db.agentActivity.create = async () => ({});
});

afterEach(() => {
  resetAgentStatusTimeoutForTest();
  db.agent.findMany = originalFindMany;
  db.agent.updateMany = originalUpdateMany;
  db.agentActivity.create = originalActivityCreate;
  if (originalEnv !== undefined) {
    process.env.CRON_SECRET = originalEnv;
  } else {
    delete process.env.CRON_SECRET;
  }
});

test("rejects request without Authorization header", async () => {
  const request = createRouteRequest(
    "http://localhost/api/cron/agent-status-timeout",
    { method: "POST" }
  );
  const response = await POST(request);

  assert.equal(response.status, 401);
});

test("rejects request with wrong secret", async () => {
  const request = createRouteRequest(
    "http://localhost/api/cron/agent-status-timeout",
    { method: "POST", apiKey: "wrong-secret" }
  );
  const response = await POST(request);

  assert.equal(response.status, 401);
});

test("accepts request with correct CRON_SECRET", async () => {
  const request = createRouteRequest(
    "http://localhost/api/cron/agent-status-timeout",
    { method: "POST", apiKey: "test-cron-secret" }
  );
  const response = await POST(request);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(typeof body.data.timedOutCount, "number");
});
