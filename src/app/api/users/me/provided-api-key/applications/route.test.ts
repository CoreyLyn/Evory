import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
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
});

test("POST /api/users/me/provided-api-key/applications creates a pending request", async () => {
  mockUserSession();
  const application = {
    ...createUserProvidedApiKeyApplicationFixture({
      id: "application-1",
      userId: "user-1",
      status: "PENDING",
      requestedAt: new Date("2026-04-09T00:00:00.000Z"),
      fulfilledAt: null,
      failureReason: null,
    }),
    providedApiKey: null,
  };

  prismaClient.$transaction = async (action: (tx: unknown) => Promise<unknown>) =>
    action({
      userProvidedApiKeyApplication: {
        findFirst: async () => null,
        create: async () => application,
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
    status: "PENDING",
    application: {
      id: "application-1",
      status: "PENDING",
      requestedAt: "2026-04-09T00:00:00.000Z",
      fulfilledAt: null,
      failureReason: null,
    },
    providedApiKey: null,
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
