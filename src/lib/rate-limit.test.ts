import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { SecurityEventType } from "@/generated/prisma/enums";
import prisma from "@/lib/prisma";
import {
  consumeRateLimit,
  resetRateLimitStore,
} from "@/lib/rate-limit";
import {
  createAgentCredentialFixture,
  createRateLimitCounterFixture,
  createSecurityEventFixture,
} from "@/test/factories";
import {
  installRateLimitStoreMock,
  installRateLimitStoreMockWithRows,
} from "@/test/rate-limit-store-mock";
import { createRouteRequest } from "@/test/request-helpers";

type RateLimitPrismaMock = {
  rateLimitCounter?: {
    deleteMany: (...args: unknown[]) => Promise<unknown>;
    upsert: (...args: unknown[]) => Promise<unknown>;
  };
};

const prismaClient = prisma as unknown as RateLimitPrismaMock;
const originalRateLimitCounter = prismaClient.rateLimitCounter;
const originalDateNow = Date.now;

afterEach(async () => {
  await resetRateLimitStore();
  prismaClient.rateLimitCounter = originalRateLimitCounter;
  Date.now = originalDateNow;
});

test("consumeRateLimit persists counters by bucket, subject, and active window", async () => {
  Date.now = () => Date.parse("2026-03-10T00:00:00.000Z");
  const rows = installRateLimitStoreMock(prismaClient);

  const request = createRouteRequest("http://localhost/api/agents/claim", {
    method: "POST",
    headers: {
      "x-forwarded-for": "198.51.100.42",
    },
  });

  const config = {
    bucketId: "agent-claim",
    maxRequests: 2,
    windowMs: 60_000,
    request,
    subjectId: "user-1",
  };

  assert.deepEqual(await consumeRateLimit(config), {
    limited: false,
    retryAfterSeconds: 0,
  });

  installRateLimitStoreMockWithRows(prismaClient, rows);

  assert.deepEqual(await consumeRateLimit(config), {
    limited: false,
    retryAfterSeconds: 0,
  });

  installRateLimitStoreMockWithRows(prismaClient, rows);

  const limited = await consumeRateLimit(config);
  assert.equal(limited.limited, true);
  assert.equal(limited.retryAfterSeconds, 60);

  const otherSubject = await consumeRateLimit({
    ...config,
    subjectId: "user-2",
  });
  assert.equal(otherSubject.limited, false);

  const otherBucket = await consumeRateLimit({
    ...config,
    bucketId: "agent-register",
  });
  assert.equal(otherBucket.limited, false);
  assert.equal(rows.size, 3);
});

test("expired durable buckets do not match new requests", async () => {
  let now = Date.parse("2026-03-10T00:00:00.000Z");
  Date.now = () => now;

  const rows = installRateLimitStoreMock(prismaClient);
  const request = createRouteRequest("http://localhost/api/agents/register", {
    method: "POST",
    headers: {
      "x-forwarded-for": "198.51.100.99",
    },
  });
  const config = {
    bucketId: "agent-register",
    maxRequests: 1,
    windowMs: 60_000,
    request,
  };

  assert.deepEqual(await consumeRateLimit(config), {
    limited: false,
    retryAfterSeconds: 0,
  });
  assert.equal((await consumeRateLimit(config)).limited, true);

  now += 61_000;
  installRateLimitStoreMockWithRows(prismaClient, rows);

  assert.deepEqual(await consumeRateLimit(config), {
    limited: false,
    retryAfterSeconds: 0,
  });

  const currentWindows = Array.from(rows.values()).filter(
    (row) => row.bucketId === "agent-register"
  );

  assert.equal(currentWindows.length, 1);
  assert.equal(currentWindows[0]?.windowStart.toISOString(), "2026-03-10T00:01:00.000Z");
});

test("concurrent consumeRateLimit calls share the same durable window key", async () => {
  Date.now = () => Date.parse("2026-03-10T00:00:00.000Z");

  const rows = installRateLimitStoreMock(prismaClient);
  const request = createRouteRequest("http://localhost/api/agents/claim", {
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.18",
    },
  });
  const config = {
    bucketId: "agent-claim",
    maxRequests: 2,
    windowMs: 60_000,
    request,
    subjectId: "user-9",
  };

  const results = await Promise.all([
    consumeRateLimit(config),
    consumeRateLimit(config),
    consumeRateLimit(config),
  ]);

  assert.deepEqual(
    results.map((result) => result.limited),
    [false, false, true]
  );
  assert.equal(rows.size, 1);
  assert.equal(Array.from(rows.values())[0]?.count, 3);
});

test("fixtures represent expanded security events and durable counters", () => {
  installRateLimitStoreMock(prismaClient);

  const event = createSecurityEventFixture({
    type: SecurityEventType.AUTH_FAILURE,
    routeKey: "auth-login",
  });
  const credential = createAgentCredentialFixture();
  const counter = createRateLimitCounterFixture({
    bucketId: "agent-claim",
    subjectKey: "198.51.100.42:user-1",
  });

  assert.equal(event.type, "AUTH_FAILURE");
  assert.deepEqual(credential.scopes, [
    "forum:read",
    "forum:write",
    "knowledge:read",
    "knowledge:write",
    "tasks:read",
    "tasks:write",
    "points:shop",
  ]);
  assert.equal(credential.expiresAt, null);
  assert.equal(counter.bucketId, "agent-claim");
  assert.equal(counter.subjectKey, "198.51.100.42:user-1");
});
