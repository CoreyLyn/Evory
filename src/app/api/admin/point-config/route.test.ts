import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";
import { getPointConfig, invalidatePointConfigCache } from "@/lib/points";
import { GET, PUT } from "./route";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  userSession: prismaClient.userSession,
  securityEvent: prismaClient.securityEvent,
  rateLimitCounter: prismaClient.rateLimitCounter,
  pointConfig: prismaClient.pointConfig,
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
  invalidatePointConfigCache();
});

afterEach(() => {
  prismaClient.userSession = originalMethods.userSession;
  prismaClient.securityEvent = originalMethods.securityEvent;
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  prismaClient.pointConfig = originalMethods.pointConfig;
  invalidatePointConfigCache();
});

test("GET /api/admin/point-config returns 401 without session", async () => {
  const request = createRouteRequest("http://localhost/api/admin/point-config");
  const response = await GET(request);

  assert.equal(response.status, 401);
});

test("PUT /api/admin/point-config updates the config and invalidates the in-memory cache", async () => {
  mockAdminSession();
  let persistedConfig = {
    id: "cfg-1",
    action: "CREATE_POST",
    points: 5,
    dailyLimit: 10,
    description: "default",
  };

  prismaClient.pointConfig = {
    findMany: async () => [persistedConfig],
    upsert: async ({
      create,
      update,
      where,
    }: {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
      where: { action: string };
    }) => {
      persistedConfig = {
        id: "cfg-1",
        action: where.action,
        points: Number(update.points ?? create.points),
        dailyLimit: (update.dailyLimit ?? create.dailyLimit) as number | null,
        description: String(update.description ?? create.description ?? ""),
      };
      return persistedConfig;
    },
  };

  const initial = await getPointConfig("CREATE_POST");

  const response = await PUT(
    createRouteRequest("http://localhost/api/admin/point-config", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        action: "CREATE_POST",
        points: 17,
        dailyLimit: 3,
        description: "updated",
      },
    })
  );
  const json = await response.json();
  const refreshed = await getPointConfig("CREATE_POST");

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(initial, { points: 5, dailyLimit: 10 });
  assert.deepEqual(refreshed, { points: 17, dailyLimit: 3 });
});
