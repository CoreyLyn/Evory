import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest, createRouteParams } from "@/test/request-helpers";
import { PATCH } from "./route";

type AsyncMethod<
  TArgs extends unknown[] = [unknown],
  TResult = unknown,
> = (...args: TArgs) => Promise<TResult>;

type UpdateAgentPrismaMock = {
  agent?: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
  userSession?: {
    findUnique: AsyncMethod;
  };
  securityEvent?: {
    create: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as UpdateAgentPrismaMock;
const originalAgentFindUnique = prismaClient.agent?.findUnique;
const originalAgentUpdate = prismaClient.agent?.update;
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
        name: "Test User",
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

afterEach(() => {
  if (prismaClient.agent) {
    if (originalAgentFindUnique)
      prismaClient.agent.findUnique = originalAgentFindUnique;
    if (originalAgentUpdate) prismaClient.agent.update = originalAgentUpdate;
  }
  if (prismaClient.userSession && originalUserSessionFindUnique) {
    prismaClient.userSession.findUnique = originalUserSessionFindUnique;
  }
  if (prismaClient.securityEvent && originalSecurityEventCreate) {
    prismaClient.securityEvent.create = originalSecurityEventCreate;
  }
});

test("PATCH returns 401 when not authenticated", async () => {
  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { name: "New Name" },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("PATCH returns 404 when agent not found or not owned", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  prismaClient.agent = {
    findUnique: async () => null,
    update: async () => ({ id: "agt-1", name: "test", type: "CUSTOM" }),
  };

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { name: "New Name" },
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Agent not found");
});

test("PATCH updates agent name successfully", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  let updatedData: Record<string, unknown> | null = null;

  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: TEST_USER_ID,
      claimStatus: "ACTIVE",
    }),
    update: async (args: unknown) => {
      const { data } = args as { data: Record<string, unknown> };
      updatedData = data;
      return { id: "agt-1", name: "New Name", type: "CUSTOM" };
    },
  };

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { name: "New Name" },
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.name, "New Name");
  assert.equal(updatedData?.name, "New Name");
});

test("PATCH updates agent type successfully", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: TEST_USER_ID,
      claimStatus: "ACTIVE",
    }),
    update: async () => ({
      id: "agt-1",
      name: "Test Agent",
      type: "CODEX",
    }),
  };

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { type: "CODEX" },
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.type, "CODEX");
});

test("PATCH returns 400 for invalid type", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: TEST_USER_ID,
      claimStatus: "ACTIVE",
    }),
    update: async () => ({ id: "agt-1", name: "test", type: "CUSTOM" }),
  };

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { type: "INVALID_TYPE" },
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "No valid fields to update");
});

test("PATCH returns 409 when name is already taken", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: TEST_USER_ID,
      claimStatus: "ACTIVE",
    }),
    update: async () => {
      const error = new Error("Unique constraint failed");
      (error as unknown as Record<string, unknown>).code = "P2002";
      throw error;
    },
  };

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { name: "Existing Name" },
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.success, false);
  assert.equal(json.error, "Agent name already taken");
});

test("PATCH accepts all valid agent types", async () => {
  const validTypes = ["OPENCLAW", "CLAUDE_CODE", "CODEX", "CUSTOM"];

  for (const type of validTypes) {
    mockAuthenticatedUser();
    mockSecurityEvent();

    prismaClient.agent = {
      findUnique: async () => ({
        id: "agt-1",
        ownerUserId: TEST_USER_ID,
        claimStatus: "ACTIVE",
      }),
      update: async () => ({
        id: "agt-1",
        name: "Test Agent",
        type,
      }),
    };

    const response = await PATCH(
      createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
        method: "PATCH",
        json: { type },
        headers: {
          cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
          origin: "http://localhost",
        },
      }),
      createRouteParams({ id: "agt-1" })
    );
    const json = await response.json();

    assert.equal(response.status, 200, `Type ${type} should be accepted`);
    assert.equal(json.success, true);
    assert.equal(json.data.type, type);
  }
});