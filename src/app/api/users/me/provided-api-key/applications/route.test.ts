import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { encryptSecretValue } from "@/lib/secret-crypto";
import { hashSessionToken } from "@/lib/user-auth";
import {
  createUserFixture,
  createUserProvidedApiKeyApplicationFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import { POST } from "./route";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  userSession: prismaClient.userSession,
  userProvidedApiKeyApplication: prismaClient.userProvidedApiKeyApplication,
  $transaction: prismaClient.$transaction,
};

const USER_TOKEN = "user-session-token";
const previousEncryptionKey = process.env.SECRET_INVENTORY_ENCRYPTION_KEY;

function mockUserSession() {
  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(USER_TOKEN)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-1",
              email: "owner@example.com",
              name: "Owner",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
}

afterEach(() => {
  prismaClient.userSession = originalMethods.userSession;
  prismaClient.userProvidedApiKeyApplication =
    originalMethods.userProvidedApiKeyApplication;
  prismaClient.$transaction = originalMethods.$transaction;
  if (previousEncryptionKey === undefined) {
    delete process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
  } else {
    process.env.SECRET_INVENTORY_ENCRYPTION_KEY = previousEncryptionKey;
  }
});

test("POST /api/users/me/provided-api-key/applications assigns an available key immediately", async () => {
  process.env.SECRET_INVENTORY_ENCRYPTION_KEY = "test-secret-encryption-key";
  mockUserSession();
  const application = {
    ...createUserProvidedApiKeyApplicationFixture({
      id: "application-1",
      userId: "user-1",
      providedApiKeyId: "key-1",
      status: "FULFILLED",
      requestedAt: new Date("2026-04-09T00:00:00.000Z"),
      fulfilledAt: new Date("2026-04-09T00:00:00.000Z"),
      fulfilledByUserId: "user-1",
      failureReason: null,
    }),
    providedApiKey: {
      id: "key-1",
      maskedKey: "sk-****1234",
      encryptedKey: encryptSecretValue("sk-live-secret-1234"),
    },
  };

  prismaClient.$transaction = async (action: (tx: unknown) => Promise<unknown>) =>
    action({
      userProvidedApiKeyApplication: {
        findFirst: async () => null,
        create: async () => application,
      },
      providedApiKey: {
        findFirst: async () => ({
          id: "key-1",
        }),
      },
    });

  const response = await POST(
    createRouteRequest(
      "http://localhost/api/users/me/provided-api-key/applications",
      {
        method: "POST",
        headers: {
          cookie: `evory_user_session=${USER_TOKEN}`,
          origin: "http://localhost",
        },
      }
    )
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(json.data, {
    status: "FULFILLED",
    application: {
      id: "application-1",
      status: "FULFILLED",
      requestedAt: "2026-04-09T00:00:00.000Z",
      fulfilledAt: "2026-04-09T00:00:00.000Z",
      failureReason: null,
    },
    providedApiKey: {
      id: "key-1",
      maskedKey: "sk-****1234",
      copyValue: "sk-live-secret-1234",
    },
  });
});

test("POST /api/users/me/provided-api-key/applications rejects duplicate pending requests", async () => {
  mockUserSession();
  prismaClient.$transaction = async (action: (tx: unknown) => Promise<unknown>) =>
    action({
      userProvidedApiKeyApplication: {
        findFirst: async () =>
          createUserProvidedApiKeyApplicationFixture({
            id: "application-1",
            status: "PENDING",
          }),
        create: async () => {
          throw new Error("should not create duplicate application");
        },
      },
    });

  const response = await POST(
    createRouteRequest(
      "http://localhost/api/users/me/provided-api-key/applications",
      {
        method: "POST",
        headers: {
          cookie: `evory_user_session=${USER_TOKEN}`,
          origin: "http://localhost",
        },
      }
    )
  );
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.success, false);
  assert.equal(json.error, "Pending application already exists");
});

test("POST /api/users/me/provided-api-key/applications rejects duplicate fulfilled requests", async () => {
  mockUserSession();
  prismaClient.$transaction = async (action: (tx: unknown) => Promise<unknown>) =>
    action({
      userProvidedApiKeyApplication: {
        findFirst: async () =>
          createUserProvidedApiKeyApplicationFixture({
            id: "application-1",
            status: "FULFILLED",
          }),
        create: async () => {
          throw new Error("should not create duplicate application");
        },
      },
    });

  const response = await POST(
    createRouteRequest(
      "http://localhost/api/users/me/provided-api-key/applications",
      {
        method: "POST",
        headers: {
          cookie: `evory_user_session=${USER_TOKEN}`,
          origin: "http://localhost",
        },
      }
    )
  );
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.success, false);
  assert.equal(json.error, "Pending application already exists");
});

test("POST /api/users/me/provided-api-key/applications returns sold-out error when no keys remain", async () => {
  mockUserSession();
  prismaClient.$transaction = async (action: (tx: unknown) => Promise<unknown>) =>
    action({
      userProvidedApiKeyApplication: {
        findFirst: async () => null,
        create: async () =>
          createUserProvidedApiKeyApplicationFixture({
            id: "application-2",
            status: "FAILED",
            fulfilledAt: new Date("2026-04-09T00:00:00.000Z"),
            fulfilledByUserId: "user-1",
            failureReason: "已发放完，请联系系统管理员。",
          }),
      },
      providedApiKey: {
        findFirst: async () => null,
      },
    });

  const response = await POST(
    createRouteRequest(
      "http://localhost/api/users/me/provided-api-key/applications",
      {
        method: "POST",
        headers: {
          cookie: `evory_user_session=${USER_TOKEN}`,
          origin: "http://localhost",
        },
      }
    )
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(json.data, {
    status: "FAILED",
    application: {
      id: "application-2",
      status: "FAILED",
      requestedAt: "2026-04-09T00:00:00.000Z",
      fulfilledAt: "2026-04-09T00:00:00.000Z",
      failureReason: "已发放完，请联系系统管理员。",
    },
    providedApiKey: null,
  });
});
