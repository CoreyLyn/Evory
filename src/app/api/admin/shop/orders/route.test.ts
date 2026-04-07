import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest } from "@/test/request-helpers";
import {
  createAgentFixture,
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { hashSessionToken } from "@/lib/user-auth";

import { GET } from "./route";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  userSession: prismaClient.userSession,
  purchaseOrder: prismaClient.purchaseOrder,
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

afterEach(() => {
  prismaClient.userSession = originalMethods.userSession;
  prismaClient.purchaseOrder = originalMethods.purchaseOrder;
});

test("GET /api/admin/shop/orders returns filtered secret-product order history", async () => {
  mockAdminSession();

  let receivedArgs: unknown = null;
  prismaClient.purchaseOrder = {
    findMany: async (args: unknown) => {
      receivedArgs = args;

      return [
        {
          id: "order-1",
          status: "FULFILLED",
          pricePaid: 300,
          currencyType: "POINTS",
          deliveryChannel: "AGENT_CHAT",
          failureReason: null,
          createdAt: new Date("2026-04-07T10:00:00.000Z"),
          fulfilledAt: new Date("2026-04-07T10:01:00.000Z"),
          product: {
            id: "product-1",
            name: "Provider Pack",
            productType: "SECRET_CREDENTIAL",
            isActive: true,
          },
          buyerAgent: createAgentFixture({
            id: "agent-2",
            name: "Buyer Agent",
            type: "CUSTOM",
            ownerUserId: "user-2",
          }),
          secretReceipt: {
            deliveredAt: new Date("2026-04-07T10:01:30.000Z"),
            secretInventory: {
              id: "inventory-1",
              maskedValue: "sk-****1234",
            },
          },
        },
      ];
    },
  };

  const response = await GET(
    createRouteRequest(
      "http://localhost/api/admin/shop/orders?productId=product-1&buyerAgentId=agent-2&status=FULFILLED",
      {
        headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
      }
    )
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(receivedArgs, {
    where: {
      productId: "product-1",
      buyerAgentId: "agent-2",
      status: "FULFILLED",
      product: {
        productType: "SECRET_CREDENTIAL",
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      pricePaid: true,
      currencyType: true,
      deliveryChannel: true,
      failureReason: true,
      createdAt: true,
      fulfilledAt: true,
      product: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
      buyerAgent: {
        select: {
          id: true,
          name: true,
          type: true,
          ownerUserId: true,
        },
      },
      secretReceipt: {
        select: {
          deliveredAt: true,
          secretInventory: {
            select: {
              id: true,
              maskedValue: true,
            },
          },
        },
      },
    },
  });
  assert.equal(json.success, true);
  assert.deepEqual(json.data, [
    {
      id: "order-1",
      status: "FULFILLED",
      pricePaid: 300,
      currencyType: "POINTS",
      deliveryChannel: "AGENT_CHAT",
      failureReason: null,
      createdAt: "2026-04-07T10:00:00.000Z",
      fulfilledAt: "2026-04-07T10:01:00.000Z",
      product: {
        id: "product-1",
        name: "Provider Pack",
        isActive: true,
      },
      buyer: {
        agentId: "agent-2",
        name: "Buyer Agent",
        type: "CUSTOM",
        ownerUserId: "user-2",
      },
      delivery: {
        deliveredAt: "2026-04-07T10:01:30.000Z",
        secretInventoryId: "inventory-1",
        maskedSecret: "sk-****1234",
      },
    },
  ]);
});

test("GET /api/admin/shop/orders rejects invalid status filters", async () => {
  mockAdminSession();

  const response = await GET(
    createRouteRequest("http://localhost/api/admin/shop/orders?status=UNKNOWN", {
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(json, {
    success: false,
    error: "Invalid order status",
  });
});
