import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest, createRouteParams } from "@/test/request-helpers";
import {
  createUserFixture,
  createUserSessionFixture,
  createSecurityEventFixture,
} from "@/test/factories";
import { hashSessionToken } from "@/lib/user-auth";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { DELETE } from "./route";

const prismaClient = prisma as Record<string, any>;

const originalMethods = {
  userSession: prismaClient.userSession,
  securityEvent: prismaClient.securityEvent,
  rateLimitCounter: prismaClient.rateLimitCounter,
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
});

afterEach(async () => {
  await resetRateLimitStore();
  prismaClient.userSession = originalMethods.userSession;
  prismaClient.securityEvent = originalMethods.securityEvent;
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
});

test("DELETE /api/admin/knowledge/documents/[path] returns 401 when not authenticated", async () => {
  mockNoSession();

  const response = await DELETE(
    createRouteRequest("http://localhost/api/admin/knowledge/documents/test-doc"),
    createRouteParams({ path: "test-doc" })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("DELETE /api/admin/knowledge/documents/[path] returns 400 for path traversal attempt", async () => {
  mockAdminSession();

  const response = await DELETE(
    createRouteRequest("http://localhost/api/admin/knowledge/documents/../secret", {
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ path: "../secret" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid path");
});

test("DELETE /api/admin/knowledge/documents/[path] returns 400 for absolute path attempt", async () => {
  mockAdminSession();

  const response = await DELETE(
    createRouteRequest("http://localhost/api/admin/knowledge/documents//etc/passwd", {
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ path: "/etc/passwd" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid path");
});

test("DELETE /api/admin/knowledge/documents/[path] returns 404 when document not found", async () => {
  mockAdminSession();

  const response = await DELETE(
    createRouteRequest("http://localhost/api/admin/knowledge/documents/nonexistent-doc", {
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ path: "nonexistent-doc" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Document not found");
});

test("DELETE /api/admin/knowledge/documents/[path] returns 403 when origin header is missing", async () => {
  mockAdminSession();

  const response = await DELETE(
    createRouteRequest("http://localhost/api/admin/knowledge/documents/test-doc", {
      method: "DELETE",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
      },
    }),
    createRouteParams({ path: "test-doc" })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid request origin");
});

test("DELETE /api/admin/knowledge/documents/[path] returns 403 when origin is cross-origin", async () => {
  mockAdminSession();

  const response = await DELETE(
    createRouteRequest("http://localhost/api/admin/knowledge/documents/test-doc", {
      method: "DELETE",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://evil.example.com",
      },
    }),
    createRouteParams({ path: "test-doc" })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid request origin");
});