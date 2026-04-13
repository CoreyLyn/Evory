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
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";
import { PUT } from "./route";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  userSession: prismaClient.userSession,
  securityEvent: prismaClient.securityEvent,
  rateLimitCounter: prismaClient.rateLimitCounter,
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
  prismaClient.providedApiKey = originalMethods.providedApiKey;
});

test("PUT /api/admin/shop/api-keys/[id] updates editable fields", async () => {
  mockAdminSession();
  let updatedWhere: unknown = null;
  let updatedData: unknown = null;
  let updateSelect: unknown = null;
  prismaClient.providedApiKey = {
    update: async ({
      where,
      data,
      select,
    }: {
      where: unknown;
      data: unknown;
      select: unknown;
    }) => {
      updatedWhere = where;
      updatedData = data;
      updateSelect = select;
      return {
        id: "key-1",
        label: "Backup OpenAI key",
        providerLabel: "OpenAI",
        maskedKey: "sk-****6789",
        encryptedKey: encryptSecretValue("sk-live-123456789"),
        isActive: false,
        createdByUserId: "admin-1",
        createdAt: new Date("2026-04-08T10:00:00.000Z"),
        updatedAt: new Date("2026-04-08T11:00:00.000Z"),
      };
    },
  };

  const response = await PUT(
    createRouteRequest("http://localhost/api/admin/shop/api-keys/key-1", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        label: "  Backup OpenAI key  ",
        providerLabel: "  OpenAI  ",
        isActive: false,
      },
    }),
    createRouteParams({ id: "key-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(updatedWhere, { id: "key-1" });
  assert.deepEqual(updatedData, {
    label: "Backup OpenAI key",
    providerLabel: "OpenAI",
    isActive: false,
  });
  assert.deepEqual(updateSelect, {
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
  assert.equal("encryptedKey" in json.data, false);
});

test("PUT /api/admin/shop/api-keys/[id] does not null out providerLabel when omitted", async () => {
  mockAdminSession();
  let updatedData: unknown = null;
  prismaClient.providedApiKey = {
    update: async ({ data }: { data: unknown }) => {
      updatedData = data;
      return {
        id: "key-1",
        label: "Backup OpenAI key",
        providerLabel: "OpenAI",
        maskedKey: "sk-****6789",
        encryptedKey: encryptSecretValue("sk-live-123456789"),
        isActive: false,
        createdByUserId: "admin-1",
        createdAt: new Date("2026-04-08T10:00:00.000Z"),
        updatedAt: new Date("2026-04-08T11:00:00.000Z"),
      };
    },
  };

  const response = await PUT(
    createRouteRequest("http://localhost/api/admin/shop/api-keys/key-1", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        label: "  Backup OpenAI key  ",
        isActive: false,
      },
    }),
    createRouteParams({ id: "key-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(updatedData, {
    label: "Backup OpenAI key",
    isActive: false,
  });
});

test("PUT /api/admin/shop/api-keys/[id] maps blank providerLabel to null", async () => {
  mockAdminSession();
  let updatedData: unknown = null;
  prismaClient.providedApiKey = {
    update: async ({ data }: { data: unknown }) => {
      updatedData = data;
      return {
        id: "key-1",
        label: "Backup OpenAI key",
        providerLabel: null,
        maskedKey: "sk-****6789",
        encryptedKey: encryptSecretValue("sk-live-123456789"),
        isActive: false,
        createdByUserId: "admin-1",
        createdAt: new Date("2026-04-08T10:00:00.000Z"),
        updatedAt: new Date("2026-04-08T11:00:00.000Z"),
      };
    },
  };

  const response = await PUT(
    createRouteRequest("http://localhost/api/admin/shop/api-keys/key-1", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        label: "Backup OpenAI key",
        providerLabel: "",
        isActive: false,
      },
    }),
    createRouteParams({ id: "key-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(updatedData, {
    label: "Backup OpenAI key",
    providerLabel: null,
    isActive: false,
  });
});

test("PUT /api/admin/shop/api-keys/[id] returns 400 for malformed JSON", async () => {
  mockAdminSession();

  const response = await PUT(
    createMalformedJsonRouteRequest(
      "http://localhost/api/admin/shop/api-keys/key-1",
      {
        method: "PUT",
        headers: {
          cookie: `evory_user_session=${ADMIN_TOKEN}`,
          origin: "http://localhost",
        },
      }
    ),
    createRouteParams({ id: "key-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid request body");
});

test("PUT /api/admin/shop/api-keys/[id] returns 404 when the key does not exist", async () => {
  mockAdminSession();
  prismaClient.providedApiKey = {
    update: async () => {
      const error = new Error("missing");
      (error as Error & { code?: string }).code = "P2025";
      throw error;
    },
  };

  const response = await PUT(
    createRouteRequest("http://localhost/api/admin/shop/api-keys/missing", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        label: "Backup OpenAI key",
        providerLabel: "OpenAI",
        isActive: false,
      },
    }),
    createRouteParams({ id: "missing" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Provided API key not found");
});
