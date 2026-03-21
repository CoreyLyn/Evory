import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest } from "@/test/request-helpers";
import { POST } from "./route";

type MockModel = {
  findMany: (args: unknown) => Promise<{ id: string }[]>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
};

type PrismaMock = {
  forumPostView: MockModel;
  userSession: MockModel;
  securityEvent: MockModel;
  rateLimitCounter: MockModel;
};

const db = prisma as unknown as PrismaMock;

const originals = {
  forumPostView: { findMany: db.forumPostView.findMany, deleteMany: db.forumPostView.deleteMany },
  userSession: { findMany: db.userSession.findMany, deleteMany: db.userSession.deleteMany },
  securityEvent: { findMany: db.securityEvent.findMany, deleteMany: db.securityEvent.deleteMany },
  rateLimitCounter: { findMany: db.rateLimitCounter.findMany, deleteMany: db.rateLimitCounter.deleteMany },
};

const originalEnv = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  for (const model of Object.values(db) as MockModel[]) {
    if (model && typeof model === "object" && "findMany" in model) {
      model.findMany = async () => [];
      model.deleteMany = async () => ({ count: 0 });
    }
  }
});

afterEach(() => {
  db.forumPostView.findMany = originals.forumPostView.findMany;
  db.forumPostView.deleteMany = originals.forumPostView.deleteMany;
  db.userSession.findMany = originals.userSession.findMany;
  db.userSession.deleteMany = originals.userSession.deleteMany;
  db.securityEvent.findMany = originals.securityEvent.findMany;
  db.securityEvent.deleteMany = originals.securityEvent.deleteMany;
  db.rateLimitCounter.findMany = originals.rateLimitCounter.findMany;
  db.rateLimitCounter.deleteMany = originals.rateLimitCounter.deleteMany;
  if (originalEnv !== undefined) {
    process.env.CRON_SECRET = originalEnv;
  } else {
    delete process.env.CRON_SECRET;
  }
});

test("rejects request without Authorization header", async () => {
  const request = createRouteRequest(
    "http://localhost/api/cron/data-cleanup",
    { method: "POST" }
  );
  const response = await POST(request);

  assert.equal(response.status, 401);
});

test("rejects request with wrong secret", async () => {
  const request = createRouteRequest(
    "http://localhost/api/cron/data-cleanup",
    { method: "POST", apiKey: "wrong-secret" }
  );
  const response = await POST(request);

  assert.equal(response.status, 401);
});

test("accepts request with correct CRON_SECRET", async () => {
  const request = createRouteRequest(
    "http://localhost/api/cron/data-cleanup",
    { method: "POST", apiKey: "test-cron-secret" }
  );
  const response = await POST(request);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(typeof body.data.forumPostViews.deleted, "number");
  assert.equal(typeof body.data.userSessions.deleted, "number");
  assert.equal(typeof body.data.securityEvents.deleted, "number");
  assert.equal(typeof body.data.rateLimitCounters.deleted, "number");
});
