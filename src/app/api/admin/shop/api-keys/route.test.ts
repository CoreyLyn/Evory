import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { encryptSecretValue } from "@/lib/secret-crypto";
import {
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";
import { GET, POST } from "./route";
// Imported here so [id] tests run under reproducible top-level node --test commands.
import "./[id]/route.test";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  userSession: prismaClient.userSession,
  securityEvent: prismaClient.securityEvent,
  rateLimitCounter: prismaClient.rateLimitCounter,
  providedApiKey: prismaClient.providedApiKey,
};

const ADMIN_TOKEN = "admin-session-token";
const previousEncryptionKey = process.env.SECRET_INVENTORY_ENCRYPTION_KEY;

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
  process.env.SECRET_INVENTORY_ENCRYPTION_KEY = "test-secret-encryption-key";
});

afterEach(() => {
  prismaClient.userSession = originalMethods.userSession;
  prismaClient.securityEvent = originalMethods.securityEvent;
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  prismaClient.providedApiKey = originalMethods.providedApiKey;
  if (previousEncryptionKey === undefined) {
    delete process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
    return;
  }
  process.env.SECRET_INVENTORY_ENCRYPTION_KEY = previousEncryptionKey;
});

test("GET /api/admin/shop/api-keys lists admin-safe provided keys", async () => {
  mockAdminSession();
  let receivedArgs: unknown = null;
  prismaClient.providedApiKey = {
    findMany: async (args: unknown) => {
      receivedArgs = args;
      return [
        {
          id: "key-1",
          label: "Primary OpenAI key",
          providerLabel: "OpenAI",
          maskedKey: "sk-****6789",
          encryptedKey: encryptSecretValue("sk-live-123456789"),
          isActive: true,
          createdByUserId: "admin-1",
          createdAt: new Date("2026-04-08T10:00:00.000Z"),
          updatedAt: new Date("2026-04-08T10:00:00.000Z"),
          _count: {
            orders: 4,
          },
        },
      ];
    },
  };

  const response = await GET(
    createRouteRequest("http://localhost/api/admin/shop/api-keys", {
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(receivedArgs, {
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      label: true,
      providerLabel: true,
      maskedKey: true,
      encryptedKey: true,
      isActive: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          orders: true,
        },
      },
    },
  });
  assert.equal(json.data[0].orderCount, 4);
  assert.equal("_count" in json.data[0], false);
  assert.equal("encryptedKey" in json.data[0], false);
});

test("POST /api/admin/shop/api-keys creates a provided api key", async () => {
  mockAdminSession();
  let createdData: Record<string, unknown> | null = null;
  let createSelect: unknown = null;
  prismaClient.providedApiKey = {
    create: async ({
      data,
      select,
    }: {
      data: Record<string, unknown>;
      select: unknown;
    }) => {
      createdData = data;
      createSelect = select;
      return {
        id: "key-1",
        label: data.label,
        providerLabel: data.providerLabel,
        maskedKey: data.maskedKey,
        isActive: data.isActive,
        createdByUserId: data.createdByUserId,
        createdAt: new Date("2026-04-08T10:00:00.000Z"),
        updatedAt: new Date("2026-04-08T10:00:00.000Z"),
        encryptedKey: data.encryptedKey,
      };
    },
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/api-keys", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        label: "Primary OpenAI key",
        providerLabel: "OpenAI",
        apiKey: "sk-live-123456789",
        isActive: true,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.ok(createdData);
  assert.equal(createdData?.label, "Primary OpenAI key");
  assert.equal(createdData?.providerLabel, "OpenAI");
  assert.equal(createdData?.maskedKey, "sk-**********6789");
  assert.equal(createdData?.createdByUserId, "admin-1");
  assert.equal(typeof createdData?.encryptedKey, "string");
  assert.equal((createdData?.encryptedKey as string).split(".").length, 3);
  assert.deepEqual(createSelect, {
    id: true,
    label: true,
    providerLabel: true,
    maskedKey: true,
    encryptedKey: true,
    isActive: true,
    createdByUserId: true,
    createdAt: true,
    updatedAt: true,
  });
  assert.equal(json.data.maskedKey, "sk-**********6789");
  assert.equal("encryptedKey" in json.data, false);
});

test("POST /api/admin/shop/api-keys returns 400 for malformed JSON", async () => {
  mockAdminSession();

  const response = await POST(
    createMalformedJsonRouteRequest("http://localhost/api/admin/shop/api-keys", {
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

test("POST /api/admin/shop/api-keys allows a missing providerLabel", async () => {
  mockAdminSession();
  let createdData: Record<string, unknown> | null = null;
  prismaClient.providedApiKey = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdData = data;
      return {
        id: "key-1",
        label: data.label,
        providerLabel: data.providerLabel,
        maskedKey: data.maskedKey,
        isActive: data.isActive,
        createdByUserId: data.createdByUserId,
        createdAt: new Date("2026-04-08T10:00:00.000Z"),
        updatedAt: new Date("2026-04-08T10:00:00.000Z"),
        encryptedKey: data.encryptedKey,
      };
    },
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/api-keys", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        label: "Primary OpenAI key",
        apiKey: "sk-live-123456789",
        isActive: true,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(createdData?.providerLabel, null);
});

test("POST /api/admin/shop/api-keys returns a clear 500 when encryption key is missing", async () => {
  mockAdminSession();
  delete process.env.SECRET_INVENTORY_ENCRYPTION_KEY;

  prismaClient.providedApiKey = {
    create: async () => {
      throw new Error("create should not run when encryption key is missing");
    },
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/api-keys", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        label: "Primary OpenAI key",
        providerLabel: "OpenAI",
        apiKey: "sk-live-123456789",
        isActive: true,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 500);
  assert.equal(json.success, false);
  assert.equal(json.error, "Server encryption key is not configured");
});
