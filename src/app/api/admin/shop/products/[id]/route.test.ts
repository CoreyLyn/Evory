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
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";
import { PUT } from "./route";

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

test("PUT /api/admin/shop/products/[id] updates a secret credential catalog product", async () => {
  mockAdminSession();
  let updatedWhere: unknown = null;
  let updatedData: unknown = null;
  prismaClient.catalogProduct = {
    findFirst: async () => ({ id: "product-1" }),
    update: async ({ where, data }: { where: unknown; data: unknown }) => {
      updatedWhere = where;
      updatedData = data;
      return createCatalogProductFixture({
        id: "product-1",
        ...(data as Record<string, unknown>),
      });
    },
  };

  const response = await PUT(
    createRouteRequest("http://localhost/api/admin/shop/products/product-1", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        name: "  Updated Pack  ",
        description: "  Revised secret  ",
        productType: "SECRET_CREDENTIAL",
        price: 450,
        isActive: false,
        displayConfig: {
          providerLabel: "Provider",
          usageInstructions: "Store securely",
        },
        fulfillmentConfig: {
          allowRepeatPurchase: false,
          perAgentPurchaseLimit: 1,
        },
      },
    }),
    createRouteParams({ id: "product-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(updatedWhere, { id: "product-1" });
  assert.deepEqual(updatedData, {
    name: "Updated Pack",
    description: "Revised secret",
    productType: "SECRET_CREDENTIAL",
    price: 450,
    isActive: false,
    displayConfig: {
      providerLabel: "Provider",
      usageInstructions: "Store securely",
    },
    fulfillmentConfig: {
      allowRepeatPurchase: false,
      perAgentPurchaseLimit: 1,
    },
  });
});

test("PUT /api/admin/shop/products/[id] returns 404 for non-secret products", async () => {
  mockAdminSession();
  let updateCalled = false;
  prismaClient.catalogProduct = {
    findFirst: async () => null,
    update: async () => {
      updateCalled = true;
      return createCatalogProductFixture();
    },
  };

  const response = await PUT(
    createRouteRequest("http://localhost/api/admin/shop/products/cosmetic-1", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        name: "Updated Pack",
        description: "Revised secret",
        productType: "SECRET_CREDENTIAL",
        price: 450,
        isActive: false,
        displayConfig: {
          providerLabel: "Provider",
        },
        fulfillmentConfig: {
          allowRepeatPurchase: false,
        },
      },
    }),
    createRouteParams({ id: "cosmetic-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Catalog product not found");
  assert.equal(updateCalled, false);
});

test("PUT /api/admin/shop/products/[id] returns 400 for malformed JSON", async () => {
  mockAdminSession();

  const response = await PUT(
    createMalformedJsonRouteRequest(
      "http://localhost/api/admin/shop/products/product-1",
      {
        method: "PUT",
        headers: {
          cookie: `evory_user_session=${ADMIN_TOKEN}`,
          origin: "http://localhost",
        },
      }
    ),
    createRouteParams({ id: "product-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid request body");
});

test("PUT /api/admin/shop/products/[id] returns 404 when the product does not exist", async () => {
  mockAdminSession();
  prismaClient.catalogProduct = {
    findFirst: async () => ({ id: "missing" }),
    update: async () => {
      const error = new Error("missing");
      (error as Error & { code?: string }).code = "P2025";
      throw error;
    },
  };

  const response = await PUT(
    createRouteRequest("http://localhost/api/admin/shop/products/missing", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        name: "Updated Pack",
        description: "Revised secret",
        productType: "SECRET_CREDENTIAL",
        price: 450,
        isActive: false,
        displayConfig: {
          providerLabel: "Provider",
        },
        fulfillmentConfig: {
          allowRepeatPurchase: false,
        },
      },
    }),
    createRouteParams({ id: "missing" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Catalog product not found");
});
