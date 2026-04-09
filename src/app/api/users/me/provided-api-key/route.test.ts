import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { hashSessionToken } from "@/lib/user-auth";
import {
  createUserFixture,
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
