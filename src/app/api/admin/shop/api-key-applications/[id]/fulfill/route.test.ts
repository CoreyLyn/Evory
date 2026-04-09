import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";
import { POST } from "./route";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  userSession: prismaClient.userSession,
  securityEvent: prismaClient.securityEvent,
  rateLimitCounter: prismaClient.rateLimitCounter,
  userProvidedApiKeyApplication: prismaClient.userProvidedApiKeyApplication,
  providedApiKey: prismaClient.providedApiKey,
};

const ADMIN_TOKEN = "admin-session-token";

function mockAdminSession() {
  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(ADMIN_TOKEN)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({ role: "ADMIN", id: "admin-1" }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
}

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => ({ id: "se-1", type: "TEST" }),
  };
});

afterEach(() => {
  prismaClient.userSession = originalMethods.userSession;
  prismaClient.securityEvent = originalMethods.securityEvent;
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  prismaClient.userProvidedApiKeyApplication =
    originalMethods.userProvidedApiKeyApplication;
  prismaClient.providedApiKey = originalMethods.providedApiKey;
});

test("POST /api/admin/shop/api-key-applications/[id]/fulfill marks a pending application as fulfilled", async () => {
  mockAdminSession();

  let keyLookupArgs: unknown = null;
  let updateArgs: unknown = null;

  prismaClient.userProvidedApiKeyApplication = {
    updateMany: async (args: unknown) => {
      updateArgs = args;
      return { count: 1 };
    },
  };
  prismaClient.providedApiKey = {
    findFirst: async (args: unknown) => {
      keyLookupArgs = args;
      return { id: "provided-key-1" };
    },
  };

  const response = await POST(
    createRouteRequest(
      "http://localhost/api/admin/shop/api-key-applications/application-1/fulfill",
      {
        method: "POST",
        headers: {
          cookie: `evory_user_session=${ADMIN_TOKEN}`,
          origin: "http://localhost",
        },
        json: {
          providedApiKeyId: "provided-key-1",
        },
      }
    ),
    createRouteParams({ id: "application-1" })
  );
  const json = await response.json();
  const fulfilledAt = (updateArgs as { data: { fulfilledAt: Date } }).data.fulfilledAt;

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(json.data, {
    id: "application-1",
    status: "FULFILLED",
    providedApiKeyId: "provided-key-1",
    fulfilledByUserId: "admin-1",
    fulfilledAt: fulfilledAt.toISOString(),
  });
  assert.deepEqual(keyLookupArgs, {
    where: {
      id: "provided-key-1",
      isActive: true,
    },
    select: {
      id: true,
    },
  });
  assert.equal(
    (updateArgs as { where: { id: string } }).where.id,
    "application-1"
  );
  assert.deepEqual(updateArgs, {
    where: {
      id: "application-1",
      status: "PENDING",
    },
    data: {
      status: "FULFILLED",
      providedApiKeyId: "provided-key-1",
      fulfilledByUserId: "admin-1",
      fulfilledAt,
    },
  });
  assert.ok(fulfilledAt instanceof Date);
});

test("POST /api/admin/shop/api-key-applications/[id]/fulfill returns 404 when the pending application is missing", async () => {
  mockAdminSession();

  prismaClient.userProvidedApiKeyApplication = {
    updateMany: async () => ({ count: 0 }),
  };
  prismaClient.providedApiKey = {
    findFirst: async () => ({ id: "provided-key-1" }),
  };

  const response = await POST(
    createRouteRequest(
      "http://localhost/api/admin/shop/api-key-applications/missing/fulfill",
      {
        method: "POST",
        headers: {
          cookie: `evory_user_session=${ADMIN_TOKEN}`,
          origin: "http://localhost",
        },
        json: {
          providedApiKeyId: "provided-key-1",
        },
      }
    ),
    createRouteParams({ id: "missing" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "API key application not found");
});

test("POST /api/admin/shop/api-key-applications/[id]/fulfill returns 404 when the provided API key is inactive or missing", async () => {
  mockAdminSession();

  prismaClient.userProvidedApiKeyApplication = {
    updateMany: async () => ({ count: 1 }),
  };
  prismaClient.providedApiKey = {
    findFirst: async () => null,
  };

  const response = await POST(
    createRouteRequest(
      "http://localhost/api/admin/shop/api-key-applications/application-1/fulfill",
      {
        method: "POST",
        headers: {
          cookie: `evory_user_session=${ADMIN_TOKEN}`,
          origin: "http://localhost",
        },
        json: {
          providedApiKeyId: "missing-key",
        },
      }
    ),
    createRouteParams({ id: "application-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Provided API key not found");
});
