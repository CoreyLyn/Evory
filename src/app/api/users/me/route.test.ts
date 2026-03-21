import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest } from "@/test/request-helpers";
import { PATCH } from "./route";

type AsyncMethod<
  TArgs extends unknown[] = [unknown],
  TResult = unknown,
> = (...args: TArgs) => Promise<TResult>;

type UserMePrismaMock = {
  user?: {
    update: AsyncMethod;
  };
  userSession?: {
    findUnique: AsyncMethod;
  };
  securityEvent?: {
    create: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as UserMePrismaMock;
const originalUserUpdate = prismaClient.user?.update;
const originalUserSessionFindUnique = prismaClient.userSession?.findUnique;
const originalSecurityEventCreate = prismaClient.securityEvent?.create;

const TEST_SESSION_TOKEN = "test-session-token";
const TEST_USER_ID = "user-1";

function mockAuthenticatedUser() {
  prismaClient.userSession = {
    findUnique: async () => ({
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      user: {
        id: TEST_USER_ID,
        email: "test@example.com",
        name: "Old Name",
        role: "USER",
      },
    }),
  };
}

function mockSecurityEvent() {
  prismaClient.securityEvent = {
    create: async () => ({ id: "evt-1" }),
  };
}

function mockUserUpdate(captureData: { value: Record<string, unknown> | null }, returnName: string) {
  prismaClient.user = {
    update: async (args: unknown) => {
      const { data } = args as { data: Record<string, unknown> };
      captureData.value = data;
      return {
        id: TEST_USER_ID,
        email: "test@example.com",
        name: returnName,
        role: "USER",
      };
    },
  };
}

beforeEach(() => {
  // No rate limiting on this endpoint
});

afterEach(() => {
  if (prismaClient.user && originalUserUpdate) {
    prismaClient.user.update = originalUserUpdate;
  }
  if (prismaClient.userSession && originalUserSessionFindUnique) {
    prismaClient.userSession.findUnique = originalUserSessionFindUnique;
  }
  if (prismaClient.securityEvent && originalSecurityEventCreate) {
    prismaClient.securityEvent.create = originalSecurityEventCreate;
  }
});

test("PATCH /api/users/me returns 401 when not authenticated", async () => {
  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me", {
      method: "PATCH",
      json: { name: "New Name" },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
});

test("PATCH /api/users/me updates name successfully", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  const captured: { value: Record<string, unknown> | null } = { value: null };
  mockUserUpdate(captured, "New Name");

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me", {
      method: "PATCH",
      json: { name: "New Name" },
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        origin: "http://localhost",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.name, "New Name");
  assert.equal(captured.value?.["name"], "New Name");
});

test("PATCH /api/users/me allows empty name", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  const captured: { value: Record<string, unknown> | null } = { value: null };
  mockUserUpdate(captured, "");

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me", {
      method: "PATCH",
      json: { name: "  " },
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        origin: "http://localhost",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(captured.value?.["name"], "");
});

test("PATCH /api/users/me rejects non-string name", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me", {
      method: "PATCH",
      json: { name: 123 },
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        origin: "http://localhost",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.code, "invalid_input");
});

test("PATCH /api/users/me rejects name exceeding 100 characters", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me", {
      method: "PATCH",
      json: { name: "a".repeat(101) },
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        origin: "http://localhost",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.code, "invalid_input");
});

test("PATCH /api/users/me trims whitespace from name", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  const captured: { value: Record<string, unknown> | null } = { value: null };
  mockUserUpdate(captured, "Trimmed");

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me", {
      method: "PATCH",
      json: { name: "  Trimmed  " },
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        origin: "http://localhost",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(captured.value?.["name"], "Trimmed");
});
