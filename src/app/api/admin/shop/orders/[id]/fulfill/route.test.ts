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
  purchaseOrder: prismaClient.purchaseOrder,
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
  prismaClient.purchaseOrder = originalMethods.purchaseOrder;
  prismaClient.providedApiKey = originalMethods.providedApiKey;
});

test("POST /api/admin/shop/orders/[id]/fulfill marks a pending api quota order as fulfilled", async () => {
  mockAdminSession();

  let orderLookupArgs: unknown = null;
  let keyLookupArgs: unknown = null;
  let updateArgs: unknown = null;

  prismaClient.purchaseOrder = {
    findFirst: async (args: unknown) => {
      orderLookupArgs = args;
      return { id: "order-1" };
    },
    update: async (args: unknown) => {
      updateArgs = args;
      return {
        id: "order-1",
        status: "FULFILLED",
      };
    },
  };
  prismaClient.providedApiKey = {
    findFirst: async (args: unknown) => {
      keyLookupArgs = args;
      return { id: "key-1" };
    },
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/orders/order-1/fulfill", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        providedApiKeyId: "key-1",
      },
    }),
    createRouteParams({ id: "order-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(orderLookupArgs, {
    where: {
      id: "order-1",
      status: "PENDING",
      product: {
        productType: "API_QUOTA",
      },
    },
    select: {
      id: true,
    },
  });
  assert.deepEqual(keyLookupArgs, {
    where: {
      id: "key-1",
      isActive: true,
    },
    select: {
      id: true,
    },
  });
  assert.equal((updateArgs as { where: { id: string } }).where.id, "order-1");
  assert.equal(
    (updateArgs as { data: { status: string } }).data.status,
    "FULFILLED"
  );
  assert.equal(
    (updateArgs as { data: { providedApiKeyId: string } }).data.providedApiKeyId,
    "key-1"
  );
  assert.equal(
    (updateArgs as { data: { confirmedByUserId: string } }).data.confirmedByUserId,
    "admin-1"
  );
});

test("POST /api/admin/shop/orders/[id]/fulfill returns 404 when the pending api quota order is missing", async () => {
  mockAdminSession();

  prismaClient.purchaseOrder = {
    findFirst: async () => null,
  };
  prismaClient.providedApiKey = {
    findFirst: async () => {
      throw new Error("provided key lookup should not run");
    },
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/orders/missing/fulfill", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        providedApiKeyId: "key-1",
      },
    }),
    createRouteParams({ id: "missing" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Purchase order not found");
});

test("POST /api/admin/shop/orders/[id]/fulfill returns 404 when the provided API key is inactive or missing", async () => {
  mockAdminSession();

  prismaClient.purchaseOrder = {
    findFirst: async () => ({ id: "order-1" }),
  };
  prismaClient.providedApiKey = {
    findFirst: async () => null,
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/orders/order-1/fulfill", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        providedApiKeyId: "missing-key",
      },
    }),
    createRouteParams({ id: "order-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Provided API key not found");
});
