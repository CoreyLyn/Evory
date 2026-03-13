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
import { GET } from "./route";
import { resetKnowledgeBaseCacheForTests } from "@/lib/knowledge-base/service";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  userSession: prismaClient.userSession,
  securityEvent: prismaClient.securityEvent,
  rateLimitCounter: prismaClient.rateLimitCounter,
};

const ADMIN_TOKEN = "admin-session-token";
const USER_TOKEN = "user-session-token";

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

function mockNonAdminSession() {
  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(USER_TOKEN)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({ role: "USER" }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
}

function mockNoSession() {
  prismaClient.userSession = {
    findUnique: async () => null,
    deleteMany: async () => ({ count: 0 }),
  };
}

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => ({ id: "se-1", type: "TEST" }),
  };
  resetKnowledgeBaseCacheForTests();
});

afterEach(async () => {
  prismaClient.userSession = originalMethods.userSession;
  prismaClient.securityEvent = originalMethods.securityEvent;
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  resetKnowledgeBaseCacheForTests();
});

// ---------------------------------------------------------------------------
// GET /api/admin/knowledge/documents
// ---------------------------------------------------------------------------

test("GET /api/admin/knowledge/documents returns 401 when not authenticated", async () => {
  mockNoSession();

  const request = createRouteRequest("http://localhost/api/admin/knowledge/documents");
  const response = await GET(request);
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("GET /api/admin/knowledge/documents returns 403 when user is not admin", async () => {
  mockNonAdminSession();

  const request = createRouteRequest("http://localhost/api/admin/knowledge/documents", {
    headers: { cookie: `evory_user_session=${USER_TOKEN}` },
  });
  const response = await GET(request);
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.error, "Forbidden: Admin access required");
});

test("GET /api/admin/knowledge/documents returns document list for admin", async () => {
  mockAdminSession();

  const request = createRouteRequest("http://localhost/api/admin/knowledge/documents", {
    headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
  });
  const response = await GET(request);
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
  assert.ok(typeof json.configured === "boolean");
  assert.ok(typeof json.rootDir === "string");
});

test("GET /api/admin/knowledge/documents sets X-Evory-Agent-API header", async () => {
  mockAdminSession();

  const request = createRouteRequest("http://localhost/api/admin/knowledge/documents", {
    headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
  });
  const response = await GET(request);

  assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
});

test("GET /api/admin/knowledge/documents returns documents sorted by path", async () => {
  mockAdminSession();

  const request = createRouteRequest("http://localhost/api/admin/knowledge/documents", {
    headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
  });
  const response = await GET(request);
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);

  // Verify documents are sorted by path
  const paths = json.data.map((doc: { path: string }) => doc.path);
  const sortedPaths = [...paths].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(paths, sortedPaths);
});