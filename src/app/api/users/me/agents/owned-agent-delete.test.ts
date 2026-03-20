import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { DELETE } from "./[id]/route";

type AsyncMethod<
  TArgs extends unknown[] = [unknown],
  TResult = unknown,
> = (...args: TArgs) => Promise<TResult>;

type DeleteAgentPrismaMock = {
  agent?: {
    findUnique: AsyncMethod;
    create?: AsyncMethod;
    delete?: AsyncMethod;
  };
  forumPost?: {
    updateMany: AsyncMethod;
  };
  forumReply?: {
    updateMany: AsyncMethod;
  };
  forumLike?: {
    updateMany: AsyncMethod;
  };
  knowledgeArticle?: {
    updateMany: AsyncMethod;
  };
  task?: {
    updateMany: AsyncMethod;
  };
  pointTransaction?: {
    updateMany: AsyncMethod;
  };
  dailyCheckin?: {
    updateMany: AsyncMethod;
  };
  agentInventory?: {
    updateMany: AsyncMethod;
  };
  userSession?: {
    findUnique: AsyncMethod;
  };
  securityEvent?: {
    create: AsyncMethod;
  };
  $transaction?: AsyncMethod<[(
    tx: DeleteAgentPrismaMock
  ) => Promise<unknown>], unknown>;
  rateLimitCounter?: {
    deleteMany: AsyncMethod;
    upsert: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as DeleteAgentPrismaMock;
const originalAgent = prismaClient.agent;
const originalForumPost = prismaClient.forumPost;
const originalForumReply = prismaClient.forumReply;
const originalForumLike = prismaClient.forumLike;
const originalKnowledgeArticle = prismaClient.knowledgeArticle;
const originalTask = prismaClient.task;
const originalPointTransaction = prismaClient.pointTransaction;
const originalDailyCheckin = prismaClient.dailyCheckin;
const originalAgentInventory = prismaClient.agentInventory;
const originalUserSession = prismaClient.userSession;
const originalSecurityEvent = prismaClient.securityEvent;
const originalTransaction = prismaClient.$transaction;
const originalRateLimitCounter = prismaClient.rateLimitCounter;

const TEST_SESSION_TOKEN = "delete-test-session-token";
const TEST_USER_ID = "user-delete-1";

function mockAuthenticatedUser() {
  prismaClient.userSession = {
    findUnique: async () => ({
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      user: {
        id: TEST_USER_ID,
        email: "delete@example.com",
        name: "Delete Owner",
        role: "USER",
      },
    }),
  };
}

function mockSecurityEvent() {
  prismaClient.securityEvent = {
    create: async () => ({ id: "evt-delete-1" }),
  };
}

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
});

afterEach(() => {
  prismaClient.agent = originalAgent;
  prismaClient.forumPost = originalForumPost;
  prismaClient.forumReply = originalForumReply;
  prismaClient.forumLike = originalForumLike;
  prismaClient.knowledgeArticle = originalKnowledgeArticle;
  prismaClient.task = originalTask;
  prismaClient.pointTransaction = originalPointTransaction;
  prismaClient.dailyCheckin = originalDailyCheckin;
  prismaClient.agentInventory = originalAgentInventory;
  prismaClient.userSession = originalUserSession;
  prismaClient.securityEvent = originalSecurityEvent;
  prismaClient.$transaction = originalTransaction;
  prismaClient.rateLimitCounter = originalRateLimitCounter;
});

test("DELETE returns 401 when not authenticated", async () => {
  const response = await DELETE(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "DELETE",
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("DELETE returns 404 when agent not found or not owned", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  prismaClient.agent = {
    findUnique: async () => null,
    create: async () => ({ id: "tombstone-1" }),
    delete: async () => ({ id: "agt-1" }),
  };

  const response = await DELETE(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "DELETE",
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

test("DELETE returns 409 when agent is not revoked", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: TEST_USER_ID,
      claimStatus: "ACTIVE",
      isDeletedPlaceholder: false,
      name: "Alpha",
      type: "CUSTOM",
      status: "TASKBOARD",
      points: 5,
      avatarConfig: {},
      bio: "",
    }),
    create: async () => ({ id: "tombstone-1" }),
    delete: async () => ({ id: "agt-1" }),
  };

  const response = await DELETE(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "DELETE",
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
  assert.equal(json.error, "Agent must be revoked before deletion");
});

test("DELETE reassigns retained relations to a tombstone agent and deletes the original agent", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  const relationCalls: Array<{ model: string; args: Record<string, unknown> }> = [];
  let createdTombstoneData: Record<string, unknown> | null = null;
  let deletedWhere: Record<string, unknown> | null = null;

  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: TEST_USER_ID,
      claimStatus: "REVOKED",
      isDeletedPlaceholder: false,
      name: "Alpha",
      type: "CODEX",
      status: "OFFLINE",
      points: 42,
      avatarConfig: { color: "red" },
      bio: "Former agent",
    }),
    create: async (args: unknown) => {
      createdTombstoneData = (args as { data: Record<string, unknown> }).data;
      return { id: "agt_deleted_1" };
    },
    delete: async (args: unknown) => {
      deletedWhere = (args as { where: Record<string, unknown> }).where;
      return { id: "agt-1" };
    },
  };
  prismaClient.forumPost = {
    updateMany: async (args: unknown) => {
      relationCalls.push({ model: "forumPost", args: args as Record<string, unknown> });
      return { count: 1 };
    },
  };
  prismaClient.forumReply = {
    updateMany: async (args: unknown) => {
      relationCalls.push({ model: "forumReply", args: args as Record<string, unknown> });
      return { count: 1 };
    },
  };
  prismaClient.forumLike = {
    updateMany: async (args: unknown) => {
      relationCalls.push({ model: "forumLike", args: args as Record<string, unknown> });
      return { count: 1 };
    },
  };
  prismaClient.knowledgeArticle = {
    updateMany: async (args: unknown) => {
      relationCalls.push({ model: "knowledgeArticle", args: args as Record<string, unknown> });
      return { count: 1 };
    },
  };
  prismaClient.task = {
    updateMany: async (args: unknown) => {
      relationCalls.push({ model: "task", args: args as Record<string, unknown> });
      return { count: 1 };
    },
  };
  prismaClient.pointTransaction = {
    updateMany: async (args: unknown) => {
      relationCalls.push({ model: "pointTransaction", args: args as Record<string, unknown> });
      return { count: 1 };
    },
  };
  prismaClient.dailyCheckin = {
    updateMany: async (args: unknown) => {
      relationCalls.push({ model: "dailyCheckin", args: args as Record<string, unknown> });
      return { count: 1 };
    },
  };
  prismaClient.agentInventory = {
    updateMany: async (args: unknown) => {
      relationCalls.push({ model: "agentInventory", args: args as Record<string, unknown> });
      return { count: 1 };
    },
  };
  prismaClient.$transaction = async (callback) => callback(prismaClient);

  const response = await DELETE(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "DELETE",
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
  assert.equal(json.data.id, "agt-1");
  assert.equal(json.data.tombstoneAgentId, "agt_deleted_1");
  assert.equal(createdTombstoneData?.isDeletedPlaceholder, true);
  assert.equal(createdTombstoneData?.claimStatus, "REVOKED");
  assert.equal(createdTombstoneData?.ownerUserId, null);
  assert.equal(deletedWhere?.id, "agt-1");

  assert.deepEqual(
    relationCalls.map((call) => call.model),
    [
      "forumPost",
      "forumReply",
      "forumLike",
      "knowledgeArticle",
      "task",
      "task",
      "pointTransaction",
      "dailyCheckin",
      "agentInventory",
    ]
  );

  for (const call of relationCalls) {
    const data = call.args.data as Record<string, unknown>;
    const targetId =
      (data.agentId as string | undefined) ??
      (data.creatorId as string | undefined) ??
      (data.assigneeId as string | undefined);

    assert.equal(targetId, "agt_deleted_1");
  }
});
