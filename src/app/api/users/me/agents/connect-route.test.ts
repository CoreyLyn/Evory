import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import {
  createForumEngagementInboxItemFixture,
  createTaskEngagementInboxItemFixture,
} from "@/test/factories";
import { hashSessionToken } from "@/lib/user-auth";
import { POST } from "./[id]/connect/route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type OwnedAgentConnectPrismaMock = {
  agent?: {
    findUnique: AsyncMethod;
  };
  userSession?: {
    findUnique: AsyncMethod;
  };
  forumEngagementInboxItem?: {
    findMany: AsyncMethod;
    updateMany: AsyncMethod;
  };
  taskEngagementInboxItem?: {
    findMany: AsyncMethod;
    updateMany: AsyncMethod;
  };
  $transaction: (input: unknown) => Promise<unknown>;
};

const prismaClient = prisma as unknown as OwnedAgentConnectPrismaMock;
const originalAgentFindUnique = prismaClient.agent?.findUnique;
const originalUserSessionFindUnique = prismaClient.userSession?.findUnique;
const originalInboxFindMany = prismaClient.forumEngagementInboxItem?.findMany;
const originalInboxUpdateMany = prismaClient.forumEngagementInboxItem?.updateMany;
const originalTaskInboxFindMany = prismaClient.taskEngagementInboxItem?.findMany;
const originalTaskInboxUpdateMany = prismaClient.taskEngagementInboxItem?.updateMany;
const originalTransaction = prismaClient.$transaction;

const TEST_SESSION_TOKEN = "test-session-token";
const TEST_USER_ID = "user-1";

function mockAuthenticatedUser() {
  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(TEST_SESSION_TOKEN)
        ? {
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
            user: {
              id: TEST_USER_ID,
              email: "test@example.com",
              name: "Test User",
              role: "USER",
            },
          }
        : null,
  };
}

function mockConsumeConnectEngagements() {
  const forumItems = [
    createForumEngagementInboxItemFixture({
      id: "eng-like-1",
      type: "LIKE",
      createdAt: new Date("2026-03-25T09:59:00.000Z"),
    }),
    createForumEngagementInboxItemFixture({
      id: "eng-reply-1",
      type: "REPLY",
      createdAt: new Date("2026-03-25T10:00:00.000Z"),
      replyId: "reply-1",
      replyPreview: "Useful reply",
    }),
  ];
  const taskItems = [
    createTaskEngagementInboxItemFixture({
      id: "task-claim-1",
      type: "CLAIMED",
      createdAt: new Date("2026-03-25T09:58:30.000Z"),
    }),
    createTaskEngagementInboxItemFixture({
      id: "task-complete-1",
      type: "COMPLETED",
      createdAt: new Date("2026-03-25T09:58:00.000Z"),
    }),
  ];

  prismaClient.forumEngagementInboxItem = {
    findMany: async () => forumItems,
    updateMany: async () => ({ count: forumItems.length }),
  };
  prismaClient.taskEngagementInboxItem = {
    findMany: async () => taskItems,
    updateMany: async () => ({ count: taskItems.length }),
  };
  prismaClient.$transaction = async (input: unknown) => {
    if (typeof input !== "function") {
      return input;
    }

    return input({
      forumEngagementInboxItem: {
        findMany: prismaClient.forumEngagementInboxItem.findMany,
        updateMany: prismaClient.forumEngagementInboxItem.updateMany,
      },
      taskEngagementInboxItem: {
        findMany: prismaClient.taskEngagementInboxItem.findMany,
        updateMany: prismaClient.taskEngagementInboxItem.updateMany,
      },
    });
  };
}

function createWebReadForumEngagementInboxItemFixture(
  overrides: Record<string, unknown> = {}
) {
  return createForumEngagementInboxItemFixture({
    viewerReadAt: new Date("2026-03-25T09:55:00.000Z"),
    agentDeliveredAt: null,
    ...overrides,
  });
}

beforeEach(() => {
  prismaClient.agent = {
    findUnique: async () => null,
  };
  prismaClient.forumEngagementInboxItem = {
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  };
  prismaClient.taskEngagementInboxItem = {
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  };
  prismaClient.$transaction = async (input: unknown) => {
    if (typeof input !== "function") {
      return input;
    }

    return input({
      forumEngagementInboxItem: {
        findMany: prismaClient.forumEngagementInboxItem.findMany,
        updateMany: prismaClient.forumEngagementInboxItem.updateMany,
      },
      taskEngagementInboxItem: {
        findMany: prismaClient.taskEngagementInboxItem.findMany,
        updateMany: prismaClient.taskEngagementInboxItem.updateMany,
      },
    });
  };
});

afterEach(() => {
  if (prismaClient.agent && originalAgentFindUnique) {
    prismaClient.agent.findUnique = originalAgentFindUnique;
  }
  if (prismaClient.userSession && originalUserSessionFindUnique) {
    prismaClient.userSession.findUnique = originalUserSessionFindUnique;
  }
  if (prismaClient.forumEngagementInboxItem && originalInboxFindMany) {
    prismaClient.forumEngagementInboxItem.findMany = originalInboxFindMany;
  }
  if (prismaClient.forumEngagementInboxItem && originalInboxUpdateMany) {
    prismaClient.forumEngagementInboxItem.updateMany = originalInboxUpdateMany;
  }
  if (prismaClient.taskEngagementInboxItem && originalTaskInboxFindMany) {
    prismaClient.taskEngagementInboxItem.findMany = originalTaskInboxFindMany;
  }
  if (prismaClient.taskEngagementInboxItem && originalTaskInboxUpdateMany) {
    prismaClient.taskEngagementInboxItem.updateMany =
      originalTaskInboxUpdateMany;
  }
  prismaClient.$transaction = originalTransaction;
});

test("POST owned-agent connect returns 401 without a user session", async () => {
  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1/connect", {
      method: "POST",
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("POST owned-agent connect returns 404 when the user does not own the agent", async () => {
  mockAuthenticatedUser();
  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: "other-user",
      name: "Owner Agent",
      type: "CODEX",
      status: "IDLE",
      points: 9,
    }),
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1/connect", {
      method: "POST",
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

test("POST owned-agent connect returns the delivered engagement summary", async () => {
  mockAuthenticatedUser();
  mockConsumeConnectEngagements();
  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: TEST_USER_ID,
      name: "Owner Agent",
      type: "CODEX",
      status: "IDLE",
      points: 9,
    }),
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1/connect", {
      method: "POST",
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
  assert.deepEqual(json.data.agent, {
    id: "agt-1",
    name: "Owner Agent",
    type: "CODEX",
    status: "IDLE",
    points: 9,
  });
  assert.equal(json.data.engagementSummary.forumLikeCount, 1);
  assert.equal(json.data.engagementSummary.forumReplyCount, 1);
  assert.equal(json.data.engagementSummary.taskClaimCount, 1);
  assert.equal(json.data.engagementSummary.taskCompleteCount, 1);
  assert.equal(json.data.engagementSummary.items[0]?.id, "eng-reply-1");
  assert.equal(json.data.engagementSummary.items[0]?.domain, "FORUM");
  assert.equal(json.data.engagementSummary.items[2]?.domain, "TASK");
  assert.equal(json.data.engagementSummary.items[0]?.reply?.content, "Useful reply");
});

test("POST owned-agent connect still delivers forum items already read in the web bell", async () => {
  mockAuthenticatedUser();
  let forumFindManyArgs: unknown = null;
  const forumItems = [
    createWebReadForumEngagementInboxItemFixture({
      id: "eng-web-read-1",
      type: "LIKE",
      createdAt: new Date("2026-03-25T09:59:00.000Z"),
    }),
  ];
  prismaClient.forumEngagementInboxItem = {
    findMany: async (args: unknown) => {
      forumFindManyArgs = args;
      return forumItems;
    },
    updateMany: async () => ({ count: forumItems.length }),
  };
  prismaClient.taskEngagementInboxItem = {
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  };
  prismaClient.$transaction = async (input: unknown) => {
    if (typeof input !== "function") {
      return input;
    }

    return input({
      forumEngagementInboxItem: {
        findMany: prismaClient.forumEngagementInboxItem.findMany,
        updateMany: prismaClient.forumEngagementInboxItem.updateMany,
      },
      taskEngagementInboxItem: {
        findMany: prismaClient.taskEngagementInboxItem.findMany,
        updateMany: prismaClient.taskEngagementInboxItem.updateMany,
      },
    });
  };
  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: TEST_USER_ID,
      name: "Owner Agent",
      type: "CODEX",
      status: "IDLE",
      points: 9,
    }),
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1/connect", {
      method: "POST",
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
  assert.equal(json.data.engagementSummary.forumLikeCount, 1);
  assert.equal(json.data.engagementSummary.items[0]?.id, "eng-web-read-1");
  assert.equal(json.data.engagementSummary.items[0]?.domain, "FORUM");
  assert.deepEqual(forumFindManyArgs, {
    where: {
      agentId: "agt-1",
      agentDeliveredAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      post: true,
      actorAgent: true,
    },
  });
  assert.equal(
    Object.hasOwn((forumFindManyArgs as Record<string, unknown>).where ?? {}, "viewerReadAt"),
    false
  );
});
