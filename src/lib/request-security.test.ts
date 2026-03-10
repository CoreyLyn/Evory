import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest } from "@/test/request-helpers";
import { enforceSameOriginControlPlaneRequest } from "./request-security";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type RequestSecurityPrismaMock = {
  securityEvent?: {
    create: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as RequestSecurityPrismaMock;
const originalSecurityEventCreate = prismaClient.securityEvent?.create;

afterEach(() => {
  if (prismaClient.securityEvent && originalSecurityEventCreate) {
    prismaClient.securityEvent.create = originalSecurityEventCreate;
  }
});

test("enforceSameOriginControlPlaneRequest allows same-origin mutation requests", async () => {
  let createdEvents = 0;

  prismaClient.securityEvent = {
    create: async () => {
      createdEvents += 1;
      return { id: "evt-1" };
    },
  };

  const response = await enforceSameOriginControlPlaneRequest({
    request: createRouteRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: {
        origin: "http://localhost",
      },
    }),
    routeKey: "auth-logout",
    userId: "user-1",
  });

  assert.equal(response, null);
  assert.equal(createdEvents, 0);
});

test("enforceSameOriginControlPlaneRequest rejects cross-origin mutation requests", async () => {
  let createdEvent: Record<string, unknown> | null = null;

  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdEvent = data;
      return { id: "evt-1" };
    },
  };

  const response = await enforceSameOriginControlPlaneRequest({
    request: createRouteRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "x-forwarded-for": "198.51.100.77",
      },
    }),
    routeKey: "auth-logout",
    userId: "user-1",
  });
  const json = await response?.json();

  assert.equal(response?.status, 403);
  assert.equal(json?.success, false);
  assert.equal(json?.error, "Invalid request origin");
  assert.deepEqual(createdEvent, {
    type: "CSRF_REJECTED",
    routeKey: "auth-logout",
    ipAddress: "198.51.100.77",
    userId: "user-1",
    metadata: {
      scope: "user",
      severity: "high",
      operation: "same_origin_guard",
      summary: "Control-plane mutation request was rejected by same-origin protection.",
      reason: "cross-origin",
      origin: "https://evil.example",
      expectedOrigin: "http://localhost",
    },
  });
});

test("enforceSameOriginControlPlaneRequest rejects mutation requests without Origin", async () => {
  let createdEvent: Record<string, unknown> | null = null;

  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdEvent = data;
      return { id: "evt-1" };
    },
  };

  const response = await enforceSameOriginControlPlaneRequest({
    request: createRouteRequest("http://localhost/api/agents/claim", {
      method: "POST",
      headers: {
        cookie: "evory_user_session=session-token",
      },
    }),
    routeKey: "agent-claim",
    userId: "user-1",
  });
  const json = await response?.json();

  assert.equal(response?.status, 403);
  assert.equal(json?.error, "Invalid request origin");
  assert.equal(createdEvent?.type, "CSRF_REJECTED");
  assert.equal(
    (createdEvent?.metadata as Record<string, unknown>).reason,
    "missing-origin"
  );
});
