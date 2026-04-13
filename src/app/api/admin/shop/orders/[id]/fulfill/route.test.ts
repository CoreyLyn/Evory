import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentFixture,
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
  purchaseOrder: prismaClient.purchaseOrder,
  providedApiKey: prismaClient.providedApiKey,
  userProvidedApiKeyApplication: prismaClient.userProvidedApiKeyApplication,
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
  prismaClient.purchaseOrder = originalMethods.purchaseOrder;
  prismaClient.providedApiKey = originalMethods.providedApiKey;
  prismaClient.userProvidedApiKeyApplication =
    originalMethods.userProvidedApiKeyApplication;
});

test("POST /api/admin/shop/orders/[id]/fulfill marks a pending api quota order as fulfilled with the buyer owner's bound API key", async () => {
  mockAdminSession();

  let findFirstArgs: unknown = null;
  let updateArgs: unknown = null;

  prismaClient.purchaseOrder = {
    findFirst: async (args: unknown) => {
      findFirstArgs = args;
      return {
        id: "order-1",
        buyerAgent: createAgentFixture({
          id: "agent-2",
          ownerUserId: "user-2",
        }),
      };
    },
    updateMany: async (args: unknown) => {
      updateArgs = args;
      return { count: 1 };
    },
  };
  prismaClient.userProvidedApiKeyApplication = {
    findFirst: async (args: unknown) => {
      assert.deepEqual(args, {
        where: {
          userId: "user-2",
          status: "FULFILLED",
          providedApiKeyId: { not: null },
          providedApiKey: {
            isActive: true,
          },
        },
        orderBy: [{ fulfilledAt: "desc" }, { requestedAt: "desc" }],
        select: {
          providedApiKeyId: true,
        },
      });

      return {
        providedApiKeyId: "provided-key-1",
      };
    },
  };
  prismaClient.providedApiKey = {};

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/orders/order-1/fulfill", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "order-1" })
  );
  const json = await response.json();
  const confirmedAt = (updateArgs as { data: { confirmedAt: Date } }).data.confirmedAt;
  const fulfilledAt = (updateArgs as { data: { fulfilledAt: Date } }).data.fulfilledAt;

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(json.data, {
    id: "order-1",
    status: "FULFILLED",
    providedApiKeyId: "provided-key-1",
    confirmedByUserId: "admin-1",
    confirmedAt: confirmedAt.toISOString(),
    fulfilledAt: fulfilledAt.toISOString(),
  });
  assert.deepEqual(findFirstArgs, {
    where: {
      id: "order-1",
      status: "PENDING",
      product: {
        productType: "API_QUOTA",
      },
    },
    select: {
      id: true,
      buyerAgent: {
        select: {
          ownerUserId: true,
        },
      },
    },
  });
  assert.deepEqual(updateArgs, {
    where: {
      id: "order-1",
      status: "PENDING",
    },
    data: {
      status: "FULFILLED",
      providedApiKeyId: "provided-key-1",
      confirmedByUserId: "admin-1",
      confirmedAt,
      fulfilledAt,
    },
  });
  assert.equal(
    (updateArgs as { data: { confirmedAt: Date } }).data.confirmedByUserId,
    "admin-1"
  );
  assert.ok(
    (updateArgs as { data: { confirmedAt: Date } }).data.confirmedAt instanceof
      Date
  );
  assert.ok(
    (updateArgs as { data: { fulfilledAt: Date } }).data.fulfilledAt instanceof
      Date
  );
});

test("POST /api/admin/shop/orders/[id]/fulfill returns 404 when the pending api quota order is missing", async () => {
  mockAdminSession();

  prismaClient.purchaseOrder = {
    findFirst: async () => null,
    updateMany: async () => ({ count: 0 }),
  };
  prismaClient.userProvidedApiKeyApplication = {};
  prismaClient.providedApiKey = {};

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/orders/missing/fulfill", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "missing" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Purchase order not found");
});

test("POST /api/admin/shop/orders/[id]/fulfill returns 404 when the buyer owner has no bound API key", async () => {
  mockAdminSession();

  prismaClient.purchaseOrder = {
    findFirst: async () => ({
      id: "order-1",
      buyerAgent: createAgentFixture({
        id: "agent-2",
        ownerUserId: "user-2",
      }),
    }),
    updateMany: async () => {
      throw new Error("order update should not run without a bound key");
    },
  };
  prismaClient.userProvidedApiKeyApplication = {
    findFirst: async () => null,
  };
  prismaClient.providedApiKey = {};

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/orders/order-1/fulfill", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "order-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Provided API key not found");
});
