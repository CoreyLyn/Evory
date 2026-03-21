import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import prisma from "@/lib/prisma";
import { RETENTION_DAYS, runDataCleanup } from "./data-cleanup";

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

function mockEmpty() {
  for (const model of Object.values(db) as MockModel[]) {
    if (model && typeof model === "object" && "findMany" in model) {
      model.findMany = async () => [];
      model.deleteMany = async () => ({ count: 0 });
    }
  }
}

beforeEach(() => {
  mockEmpty();
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
});

describe("runDataCleanup", () => {
  test("returns zero counts when no expired data exists", async () => {
    const result = await runDataCleanup();

    assert.deepEqual(result, {
      forumPostViews: { deleted: 0 },
      userSessions: { deleted: 0 },
      securityEvents: { deleted: 0 },
      rateLimitCounters: { deleted: 0 },
    });
  });

  test("deletes expired forum post views older than retention period", async () => {
    let capturedWhere: Record<string, unknown> | null = null;

    db.forumPostView.findMany = async (args: unknown) => {
      const { where } = args as { where: Record<string, unknown> };
      capturedWhere = where;
      return [{ id: "view-1" }, { id: "view-2" }];
    };
    db.forumPostView.deleteMany = async () => ({ count: 2 });

    const now = new Date("2026-03-21T12:00:00Z");
    const result = await runDataCleanup(now);

    assert.equal(result.forumPostViews.deleted, 2);
    assert.ok(capturedWhere);

    const cutoff = (capturedWhere!.createdAt as { lt: Date }).lt;
    const expectedCutoff = new Date(now.getTime() - RETENTION_DAYS.forumPostViews * 24 * 60 * 60 * 1000);
    assert.equal(cutoff.getTime(), expectedCutoff.getTime());
  });

  test("deletes expired user sessions", async () => {
    let capturedWhere: Record<string, unknown> | null = null;

    db.userSession.findMany = async (args: unknown) => {
      const { where } = args as { where: Record<string, unknown> };
      capturedWhere = where;
      return [{ id: "session-1" }];
    };
    db.userSession.deleteMany = async () => ({ count: 1 });

    const now = new Date("2026-03-21T12:00:00Z");
    const result = await runDataCleanup(now);

    assert.equal(result.userSessions.deleted, 1);
    assert.ok(capturedWhere);

    const expiresAt = (capturedWhere!.expiresAt as { lte: Date }).lte;
    assert.equal(expiresAt.getTime(), now.getTime());
  });

  test("deletes security events older than retention period", async () => {
    let capturedWhere: Record<string, unknown> | null = null;

    db.securityEvent.findMany = async (args: unknown) => {
      const { where } = args as { where: Record<string, unknown> };
      capturedWhere = where;
      return [{ id: "event-1" }, { id: "event-2" }, { id: "event-3" }];
    };
    db.securityEvent.deleteMany = async () => ({ count: 3 });

    const now = new Date("2026-03-21T12:00:00Z");
    const result = await runDataCleanup(now);

    assert.equal(result.securityEvents.deleted, 3);
    assert.ok(capturedWhere);

    const cutoff = (capturedWhere!.createdAt as { lt: Date }).lt;
    const expectedCutoff = new Date(now.getTime() - RETENTION_DAYS.securityEvents * 24 * 60 * 60 * 1000);
    assert.equal(cutoff.getTime(), expectedCutoff.getTime());
  });

  test("deletes expired rate limit counters", async () => {
    let capturedWhere: Record<string, unknown> | null = null;

    db.rateLimitCounter.findMany = async (args: unknown) => {
      const { where } = args as { where: Record<string, unknown> };
      capturedWhere = where;
      return [{ id: "counter-1" }];
    };
    db.rateLimitCounter.deleteMany = async () => ({ count: 1 });

    const now = new Date("2026-03-21T12:00:00Z");
    const result = await runDataCleanup(now);

    assert.equal(result.rateLimitCounters.deleted, 1);
    assert.ok(capturedWhere);

    const windowEnd = (capturedWhere!.windowEnd as { lte: Date }).lte;
    assert.equal(windowEnd.getTime(), now.getTime());
  });

  test("handles batch deletion across multiple iterations", async () => {
    let callCount = 0;

    db.forumPostView.findMany = async () => {
      callCount++;
      if (callCount === 1) {
        // First batch: return 1000 items (full batch)
        return Array.from({ length: 1000 }, (_, i) => ({ id: `view-${i}` }));
      }
      // Second batch: return fewer items (last batch)
      return [{ id: "view-final" }];
    };
    db.forumPostView.deleteMany = async (args: unknown) => {
      const { where } = args as { where: { id: { in: string[] } } };
      return { count: where.id.in.length };
    };

    const result = await runDataCleanup();

    assert.equal(result.forumPostViews.deleted, 1001);
    assert.equal(callCount, 2);
  });
});
