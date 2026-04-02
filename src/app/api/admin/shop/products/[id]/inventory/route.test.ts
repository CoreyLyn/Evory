import { NextRequest } from "next/server";
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
  catalogProduct: prismaClient.catalogProduct,
  $transaction: prismaClient.$transaction,
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
  prismaClient.$transaction = originalMethods.$transaction;
  delete process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
});

test("POST /api/admin/shop/products/[id]/inventory imports secret inventory rows", async () => {
  mockAdminSession();
  process.env.SECRET_INVENTORY_ENCRYPTION_KEY = "test-secret-encryption-key";

  let batchCreateArgs: unknown = null;
  let createManyArgs: unknown = null;
  prismaClient.catalogProduct = {
    findFirst: async () => ({ id: "product-1" }),
  };
  prismaClient.$transaction = async (
    callback: (tx: Record<string, unknown>) => Promise<unknown>
  ) => {
    const tx = {
      secretImportBatch: {
        create: async (args: unknown) => {
          batchCreateArgs = args;
          return {
            id: "batch-1",
            importCount: 2,
          };
        },
      },
      secretInventory: {
        createMany: async (args: unknown) => {
          createManyArgs = args;
          return { count: 2 };
        },
      },
    };

    return callback(tx);
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/products/product-1/inventory", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        sourceLabel: "  batch-1  ",
        note: "  initial load  ",
        secrets: "  sk-live-abcdef1234  \nsk-live-abcdef1234\nsk-live-xyz98765",
      },
    }),
    createRouteParams({ id: "product-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(json.data, {
    importBatchId: "batch-1",
    importCount: 2,
  });
  assert.equal("maskedValue" in json.data, false);
  assert.equal("encryptedValue" in json.data, false);
  assert.equal(JSON.stringify(json).includes("sk-live-abcdef1234"), false);
  assert.deepEqual(batchCreateArgs, {
    data: {
      productId: "product-1",
      sourceLabel: "batch-1",
      note: "initial load",
      importedByUserId: "admin-1",
      importCount: 2,
    },
  });
  assert.ok(createManyArgs && typeof createManyArgs === "object");
  const data = (createManyArgs as { data: Array<Record<string, unknown>> }).data;

  assert.equal(data.length, 2);
  assert.deepEqual(
    data.map(({ productId, importBatchId, maskedValue }) => ({
      productId,
      importBatchId,
      maskedValue,
    })),
    [
      {
        productId: "product-1",
        importBatchId: "batch-1",
        maskedValue: "sk-****1234",
      },
      {
        productId: "product-1",
        importBatchId: "batch-1",
        maskedValue: "sk-****8765",
      },
    ]
  );
  for (const row of data) {
    assert.equal(typeof row.encryptedValue, "string");
    assert.equal((row.encryptedValue as string).split(".").length, 3);
  }
});

test("POST /api/admin/shop/products/[id]/inventory returns 404 for non-secret products", async () => {
  mockAdminSession();
  let transactionCalled = false;
  let findFirstArgs: unknown = null;
  prismaClient.catalogProduct = {
    findFirst: async (args: unknown) => {
      findFirstArgs = args;
      return null;
    },
  };
  prismaClient.$transaction = async () => {
    transactionCalled = true;
    return null;
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/products/product-1/inventory", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        sourceLabel: "batch-1",
        note: "",
        secrets: "sk-1",
      },
    }),
    createRouteParams({ id: "product-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Catalog product not found");
  assert.equal(transactionCalled, false);
  assert.deepEqual(findFirstArgs, {
    where: {
      id: "product-1",
      productType: "SECRET_CREDENTIAL",
    },
    select: {
      id: true,
    },
  });
});

test("POST /api/admin/shop/products/[id]/inventory returns 400 for malformed JSON", async () => {
  mockAdminSession();

  const response = await POST(
    createMalformedJsonRouteRequest(
      "http://localhost/api/admin/shop/products/product-1/inventory",
      {
        method: "POST",
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
