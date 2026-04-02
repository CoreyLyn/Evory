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
  secretInventory: prismaClient.secretInventory,
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
  prismaClient.secretInventory = originalMethods.secretInventory;
});

test("POST /api/admin/shop/inventory/[inventoryId]/void voids available inventory", async () => {
  mockAdminSession();
  let updateManyArgs: unknown = null;
  prismaClient.secretInventory = {
    updateMany: async (args: unknown) => {
      updateManyArgs = args;
      return { count: 1 };
    },
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/inventory/inventory-1/void", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ inventoryId: "inventory-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(updateManyArgs, {
    where: {
      id: "inventory-1",
      status: "AVAILABLE",
    },
    data: {
      status: "VOID",
    },
  });
});

test("POST /api/admin/shop/inventory/[inventoryId]/void returns 404 when no available row exists", async () => {
  mockAdminSession();
  prismaClient.secretInventory = {
    updateMany: async () => ({ count: 0 }),
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/inventory/inventory-1/void", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ inventoryId: "inventory-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Available secret inventory not found");
});
