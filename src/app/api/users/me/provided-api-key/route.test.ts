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
import { GET } from "./route";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  userSession: prismaClient.userSession,
  userProvidedApiKeyApplication: prismaClient.userProvidedApiKeyApplication,
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
  if (previousEncryptionKey === undefined) {
    delete process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
  } else {
    process.env.SECRET_INVENTORY_ENCRYPTION_KEY = previousEncryptionKey;
  }
});

test("GET /api/users/me/provided-api-key returns NONE when no application exists", async () => {
  mockUserSession();
  prismaClient.userProvidedApiKeyApplication = {
    findFirst: async () => null,
  };

  const response = await GET(
    createRouteRequest("http://localhost/api/users/me/provided-api-key", {
      headers: { cookie: `evory_user_session=${USER_TOKEN}` },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(json.data, {
    status: "NONE",
    application: null,
    providedApiKey: null,
  });
});

test("GET /api/users/me/provided-api-key returns latest application summary", async () => {
  process.env.SECRET_INVENTORY_ENCRYPTION_KEY = "test-secret-encryption-key";
  mockUserSession();
  prismaClient.userProvidedApiKeyApplication = {
    findFirst: async () => ({
      ...createUserProvidedApiKeyApplicationFixture({
        id: "application-1",
        status: "FULFILLED",
        requestedAt: new Date("2026-04-09T00:00:00.000Z"),
        fulfilledAt: new Date("2026-04-10T00:00:00.000Z"),
        failureReason: null,
      }),
      providedApiKey: {
        id: "key-1",
        maskedKey: "sk-****1234",
        encryptedKey: encryptSecretValue("sk-live-secret-1234"),
      },
    }),
  };

  const response = await GET(
    createRouteRequest("http://localhost/api/users/me/provided-api-key", {
      headers: { cookie: `evory_user_session=${USER_TOKEN}` },
    })
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
      fulfilledAt: "2026-04-10T00:00:00.000Z",
      failureReason: null,
    },
    providedApiKey: {
      id: "key-1",
      maskedKey: "sk-************1234",
      copyValue: "sk-live-secret-1234",
    },
  });
});
