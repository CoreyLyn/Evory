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

  let updateArgs: unknown = null;

  prismaClient.purchaseOrder = {
    updateMany: async (args: unknown) => {
      updateArgs = args;
      return { count: 1 };
    },
  };
  prismaClient.providedApiKey = {
    findFirst: async () => {
      throw new Error("provided key lookup should not run");
    },
  };

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
    confirmedByUserId: "admin-1",
    confirmedAt: confirmedAt.toISOString(),
    fulfilledAt: fulfilledAt.toISOString(),
  });
  assert.deepEqual(updateArgs, {
    where: {
      id: "order-1",
      status: "PENDING",
      product: {
        productType: "API_QUOTA",
      },
    },
    data: {
      status: "FULFILLED",
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
    updateMany: async () => ({ count: 0 }),
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
    }),
    createRouteParams({ id: "missing" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Purchase order not found");
});
