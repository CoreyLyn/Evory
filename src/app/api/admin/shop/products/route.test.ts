import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createCatalogProductFixture,
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";
import { GET, POST } from "./route";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  userSession: prismaClient.userSession,
  securityEvent: prismaClient.securityEvent,
  rateLimitCounter: prismaClient.rateLimitCounter,
  catalogProduct: prismaClient.catalogProduct,
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

function createMalformedJsonRouteRequest(
  url: string,
  options: {
    method: string;
    headers?: HeadersInit;
  }
) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  return new NextRequest(url, {
    method: options.method,
    headers,
    body: "{",
  });
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
  prismaClient.catalogProduct = originalMethods.catalogProduct;
});

test("GET /api/admin/shop/products lists secret credential products with counts", async () => {
  mockAdminSession();
  let receivedArgs: unknown = null;
  prismaClient.catalogProduct = {
    findMany: async (args: unknown) => {
      receivedArgs = args;
      return [
        createCatalogProductFixture({
          id: "product-1",
          isActive: false,
          _count: {
            secretInventory: 2,
            purchaseOrders: 5,
          },
        }),
      ];
    },
  };

  const response = await GET(
    createRouteRequest("http://localhost/api/admin/shop/products", {
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(receivedArgs, {
    where: { productType: "SECRET_CREDENTIAL" },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: {
          secretInventory: true,
          purchaseOrders: true,
        },
      },
    },
  });
  assert.equal(json.success, true);
  assert.equal(json.data[0].inventoryCount, 2);
  assert.equal(json.data[0].orderCount, 5);
  assert.equal("_count" in json.data[0], false);
});

test("POST /api/admin/shop/products creates a secret credential catalog product", async () => {
  mockAdminSession();
  let createdData: Record<string, unknown> | null = null;
  prismaClient.catalogProduct = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdData = data;
      return createCatalogProductFixture(data);
    },
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/products", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        name: "  Provider Key Pack  ",
        description: "  One key  ",
        productType: "SECRET_CREDENTIAL",
        price: 300,
        isActive: true,
        displayConfig: {
          providerLabel: "Provider",
        },
        fulfillmentConfig: {
          allowRepeatPurchase: true,
        },
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(createdData, {
    name: "Provider Key Pack",
    description: "One key",
    productType: "SECRET_CREDENTIAL",
    price: 300,
    isActive: true,
    displayConfig: {
      providerLabel: "Provider",
    },
    fulfillmentConfig: {
      allowRepeatPurchase: true,
    },
  });
});

test("POST /api/admin/shop/products returns 400 for malformed JSON", async () => {
  mockAdminSession();

  const response = await POST(
    createMalformedJsonRouteRequest("http://localhost/api/admin/shop/products", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid request body");
});
