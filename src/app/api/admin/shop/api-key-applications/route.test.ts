import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { hashSessionToken } from "@/lib/user-auth";
import {
  createUserFixture,
  createUserProvidedApiKeyApplicationFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteRequest } from "@/test/request-helpers";
import { GET } from "./route";
// Node test discovery can miss dynamic-segment siblings when invoked by path.
import "./[id]/fulfill/route.test";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  userSession: prismaClient.userSession,
  securityEvent: prismaClient.securityEvent,
  rateLimitCounter: prismaClient.rateLimitCounter,
  userProvidedApiKeyApplication: prismaClient.userProvidedApiKeyApplication,
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
  prismaClient.userProvidedApiKeyApplication =
    originalMethods.userProvidedApiKeyApplication;
});

test("GET /api/admin/shop/api-key-applications returns bound account keys with user info", async () => {
  mockAdminSession();
  prismaClient.userProvidedApiKeyApplication = {
    findMany: async () => [
      createUserProvidedApiKeyApplicationFixture({
        id: "application-1",
        status: "FULFILLED",
        requestedAt: new Date("2026-04-09T00:00:00.000Z"),
        fulfilledAt: new Date("2026-04-09T01:00:00.000Z"),
        fulfilledByUserId: "user-1",
        user: createUserFixture({
          id: "user-1",
          email: "owner@example.com",
          name: "Owner",
        }),
        providedApiKey: {
          id: "provided-key-1",
          maskedKey: "sk-****1234",
          isActive: true,
        },
      }),
    ],
  };

  const response = await GET(
    createRouteRequest("http://localhost/api/admin/shop/api-key-applications", {
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(json.data[0], {
    id: "application-1",
    status: "FULFILLED",
    requestedAt: "2026-04-09T00:00:00.000Z",
    fulfilledAt: "2026-04-09T01:00:00.000Z",
    user: {
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
    },
    providedApiKey: {
      id: "provided-key-1",
      maskedKey: "sk-****1234",
      isActive: true,
    },
  });
});
