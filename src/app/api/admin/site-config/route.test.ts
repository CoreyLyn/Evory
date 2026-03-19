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
import { GET, PUT } from "./route";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  userSession: prismaClient.userSession,
  securityEvent: prismaClient.securityEvent,
  rateLimitCounter: prismaClient.rateLimitCounter,
  siteConfig: prismaClient.siteConfig,
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
  prismaClient.siteConfig = originalMethods.siteConfig;
});

test("GET /api/admin/site-config returns 401 without session", async () => {
  const request = createRouteRequest("http://localhost/api/admin/site-config");
  const response = await GET(request);

  assert.equal(response.status, 401);
});

test("GET /api/admin/site-config returns the current site config for admins", async () => {
  mockAdminSession();
  prismaClient.siteConfig = {
    findFirst: async () => ({
      id: "site-config-singleton",
      registrationEnabled: false,
      publicContentEnabled: true,
    }),
  };

  const request = createRouteRequest("http://localhost/api/admin/site-config", {
    headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
  });
  const response = await GET(request);
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.registrationEnabled, false);
  assert.equal(json.data.publicContentEnabled, true);
});

test("PUT /api/admin/site-config returns 403 when origin header is missing", async () => {
  const request = createRouteRequest("http://localhost/api/admin/site-config", {
    method: "PUT",
    headers: {
      cookie: "evory_user_session=admin-session-token",
    },
    json: {
      registrationEnabled: false,
      publicContentEnabled: false,
    },
  });
  const response = await PUT(request);

  assert.equal(response.status, 403);
});

test("PUT /api/admin/site-config updates the singleton config for admins", async () => {
  mockAdminSession();
  let savedArgs: { create: unknown; update: unknown; where: unknown } | null = null;
  prismaClient.siteConfig = {
    findFirst: async () => ({
      id: "site-config-singleton",
      registrationEnabled: true,
      publicContentEnabled: true,
    }),
    upsert: async ({
      create,
      update,
      where,
    }: {
      create: unknown;
      update: unknown;
      where: unknown;
    }) => {
      savedArgs = { create, update, where };
      return {
        id: "site-config-singleton",
        registrationEnabled: false,
        publicContentEnabled: false,
      };
    },
  };

  const request = createRouteRequest("http://localhost/api/admin/site-config", {
    method: "PUT",
    headers: {
      cookie: `evory_user_session=${ADMIN_TOKEN}`,
      origin: "http://localhost",
    },
    json: {
      registrationEnabled: false,
      publicContentEnabled: false,
    },
  });
  const response = await PUT(request);
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.registrationEnabled, false);
  assert.equal(json.data.publicContentEnabled, false);
  assert.deepEqual(savedArgs, {
    where: { id: "site-config-singleton" },
    create: {
      id: "site-config-singleton",
      registrationEnabled: false,
      publicContentEnabled: false,
    },
    update: {
      registrationEnabled: false,
      publicContentEnabled: false,
    },
  });
});
