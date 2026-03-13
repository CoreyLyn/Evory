import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createUserFixture,
  createUserSessionFixture,
  createSecurityEventFixture,
} from "@/test/factories";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { resetKnowledgeBaseCacheForTests } from "@/lib/knowledge-base/service";
import { POST } from "./route";

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
    create: async () => createSecurityEventFixture(),
  };
  resetKnowledgeBaseCacheForTests();
});

afterEach(async () => {
  await resetRateLimitStore();
  prismaClient.userSession = originalMethods.userSession;
  prismaClient.securityEvent = originalMethods.securityEvent;
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  resetKnowledgeBaseCacheForTests();
});

// ---------------------------------------------------------------------------
// POST /api/admin/knowledge/upload
// ---------------------------------------------------------------------------

test("POST /api/admin/knowledge/upload returns 401 when not authenticated", async () => {
  mockNoSession();

  const formData = new FormData();
  formData.append("file", new Blob(["# Test"], { type: "text/markdown" }), "test.md");

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/knowledge/upload", {
      method: "POST",
      body: formData,
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("POST /api/admin/knowledge/upload returns 403 when user is not admin", async () => {
  mockNonAdminSession();

  const formData = new FormData();
  formData.append("file", new Blob(["# Test"], { type: "text/markdown" }), "test.md");

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/knowledge/upload", {
      method: "POST",
      body: formData,
      headers: { cookie: `evory_user_session=${USER_TOKEN}` },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.error, "Forbidden: Admin access required");
});

test("POST /api/admin/knowledge/upload returns 403 when origin header is missing", async () => {
  mockAdminSession();

  const formData = new FormData();
  formData.append("file", new Blob(["# Test"], { type: "text/markdown" }), "test.md");

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/knowledge/upload", {
      method: "POST",
      body: formData,
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid request origin");
});

test("POST /api/admin/knowledge/upload returns 403 when origin is cross-origin", async () => {
  mockAdminSession();

  const formData = new FormData();
  formData.append("file", new Blob(["# Test"], { type: "text/markdown" }), "test.md");

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/knowledge/upload", {
      method: "POST",
      body: formData,
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://evil.example.com",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid request origin");
});

test("POST /api/admin/knowledge/upload sets X-Evory-Agent-API header", async () => {
  mockAdminSession();

  const formData = new FormData();
  formData.append("file", new Blob(["# Test"], { type: "text/markdown" }), "test.md");

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/knowledge/upload", {
      method: "POST",
      body: formData,
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    })
  );

  assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
});