import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { hashSessionToken } from "@/lib/user-auth";
import { createRouteRequest } from "@/test/request-helpers";
import {
  createForumEngagementInboxItemFixture,
  createTaskEngagementInboxItemFixture,
} from "@/test/factories";

import { GET } from "./route";

type OwnedAgentNotificationPrismaMock = {
  agent?: {
    findMany: (args: unknown) => Promise<Array<{ id: string; name: string }>>;
  };
  userSession?: {
    findUnique: (args: unknown) => Promise<{
      expiresAt: Date;
      user: {
        id: string;
        email: string;
        name: string | null;
        role: string;
      };
    } | null>;
  };
  forumEngagementInboxItem?: {
    findMany: (args: unknown) => Promise<unknown[]>;
    count?: (args: unknown) => Promise<number>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  taskEngagementInboxItem?: {
    findMany: (args: unknown) => Promise<unknown[]>;
    count?: (args: unknown) => Promise<number>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
};

const prismaClient = prisma as unknown as OwnedAgentNotificationPrismaMock;
const originalAgentFindMany = prismaClient.agent?.findMany;
const originalUserSessionFindUnique = prismaClient.userSession?.findUnique;
const originalForumFindMany = prismaClient.forumEngagementInboxItem?.findMany;
const originalForumUpdateMany = prismaClient.forumEngagementInboxItem?.updateMany;
const originalTaskFindMany = prismaClient.taskEngagementInboxItem?.findMany;
const originalTaskUpdateMany = prismaClient.taskEngagementInboxItem?.updateMany;

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

beforeEach(() => {
  prismaClient.agent = {
    findMany: async () => [],
  };
  prismaClient.forumEngagementInboxItem = {
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  };
  prismaClient.taskEngagementInboxItem = {
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  };
});

afterEach(() => {
  if (prismaClient.agent && originalAgentFindMany) {
    prismaClient.agent.findMany = originalAgentFindMany;
  }
  if (prismaClient.userSession && originalUserSessionFindUnique) {
    prismaClient.userSession.findUnique = originalUserSessionFindUnique;
  }
  if (prismaClient.forumEngagementInboxItem && originalForumFindMany) {
    prismaClient.forumEngagementInboxItem.findMany = originalForumFindMany;
  }
  if (prismaClient.forumEngagementInboxItem && originalForumUpdateMany) {
    prismaClient.forumEngagementInboxItem.updateMany = originalForumUpdateMany;
  }
  if (prismaClient.taskEngagementInboxItem && originalTaskFindMany) {
    prismaClient.taskEngagementInboxItem.findMany = originalTaskFindMany;
  }
  if (prismaClient.taskEngagementInboxItem && originalTaskUpdateMany) {
    prismaClient.taskEngagementInboxItem.updateMany = originalTaskUpdateMany;
  }
});

test("GET /api/users/me/agent-notifications returns 401 without auth", async () => {
  const response = await GET(
    createRouteRequest("http://localhost/api/users/me/agent-notifications")
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("GET /api/users/me/agent-notifications returns mixed unread items for owned agents", async () => {
  mockAuthenticatedUser();
  const forumFindManyArgs: Record<string, unknown>[] = [];
  const taskFindManyArgs: Record<string, unknown>[] = [];
  const forumCountArgs: Record<string, unknown>[] = [];
  const taskCountArgs: Record<string, unknown>[] = [];

  prismaClient.agent = {
    findMany: async () => [
      { id: "author-1", name: "Author Agent" },
      { id: "creator-1", name: "Creator Agent" },
    ],
  };
  prismaClient.forumEngagementInboxItem = {
    findMany: async (args: Record<string, unknown>) => {
      forumFindManyArgs.push(args);
      return [
        createForumEngagementInboxItemFixture({
          id: "forum-eng-1",
          type: "REPLY",
          createdAt: new Date("2026-03-25T09:59:00.000Z"),
          replyId: "reply-1",
          replyPreview: "Useful reply",
          post: {
            id: "post-1",
            title: "Forum post",
          },
          actorAgent: {
            id: "actor-1",
            name: "Forum Actor",
            type: "CODEX",
          },
        }),
      ];
    },
    count: async (args: { where: Record<string, unknown> }) => {
      forumCountArgs.push(args.where);
      return args.where.type === "REPLY" ? 1 : 0;
    },
    updateMany: async () => ({ count: 1 }),
  };
  prismaClient.taskEngagementInboxItem = {
    findMany: async (args: Record<string, unknown>) => {
      taskFindManyArgs.push(args);
      return [
        createTaskEngagementInboxItemFixture({
          id: "task-eng-1",
          type: "CLAIMED",
          createdAt: new Date("2026-03-25T09:58:00.000Z"),
          task: {
            id: "task-1",
            title: "Task title",
          },
          actorAgent: {
            id: "actor-2",
            name: "Task Actor",
            type: "CUSTOM",
          },
        }),
      ];
    },
    count: async (args: { where: Record<string, unknown> }) => {
      taskCountArgs.push(args.where);
      return args.where.type === "CLAIMED" ? 1 : 0;
    },
    updateMany: async () => ({ count: 1 }),
  };

  const response = await GET(
    createRouteRequest("http://localhost/api/users/me/agent-notifications", {
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.hasUnread, true);
  assert.equal(json.data.replyCount, 1);
  assert.equal(json.data.claimCount, 1);
  assert.equal(json.data.likeCount, 0);
  assert.equal(json.data.completeCount, 0);
  assert.deepEqual(forumFindManyArgs, [
    {
      where: {
        agentId: { in: ["author-1", "creator-1"] },
        viewerReadAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        post: true,
        actorAgent: true,
      },
    },
  ]);
  assert.deepEqual(taskFindManyArgs, [
    {
      where: {
        agentId: { in: ["author-1", "creator-1"] },
        viewerReadAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        task: true,
        actorAgent: true,
      },
    },
  ]);
  assert.deepEqual(forumCountArgs, [
    {
      agentId: { in: ["author-1", "creator-1"] },
      viewerReadAt: null,
      type: "LIKE",
    },
    {
      agentId: { in: ["author-1", "creator-1"] },
      viewerReadAt: null,
      type: "REPLY",
    },
  ]);
  assert.deepEqual(taskCountArgs, [
    {
      agentId: { in: ["author-1", "creator-1"] },
      viewerReadAt: null,
      type: "CLAIMED",
    },
    {
      agentId: { in: ["author-1", "creator-1"] },
      viewerReadAt: null,
      type: "COMPLETED",
    },
  ]);
  assert.deepEqual(
    json.data.items.map((item: { domain: string }) => item.domain),
    ["FORUM", "TASK"]
  );
  assert.equal(json.data.items[0].destinationHref, "/forum/post-1");
  assert.equal(json.data.items[1].destinationHref, "/tasks/task-1");
  assert.equal(json.data.items[0].ownerAgent.name, "Author Agent");
  assert.equal(json.data.items[1].ownerAgent.name, "Creator Agent");
});

test("GET /api/users/me/agent-notifications returns only the recent compact slice", async () => {
  mockAuthenticatedUser();
  const findManyArgs: Record<string, unknown>[] = [];
  const countArgs: Record<string, unknown>[] = [];

  prismaClient.agent = {
    findMany: async () => [{ id: "author-1", name: "Author Agent" }],
  };
  prismaClient.forumEngagementInboxItem = {
    findMany: async (args: Record<string, unknown>) => {
      findManyArgs.push(args);
      return [
        createForumEngagementInboxItemFixture({
          id: "forum-eng-1",
          createdAt: new Date("2026-03-25T10:05:00.000Z"),
        }),
        createForumEngagementInboxItemFixture({
          id: "forum-eng-2",
          createdAt: new Date("2026-03-25T10:04:00.000Z"),
        }),
        createForumEngagementInboxItemFixture({
          id: "forum-eng-3",
          createdAt: new Date("2026-03-25T10:03:00.000Z"),
        }),
        createForumEngagementInboxItemFixture({
          id: "forum-eng-4",
          createdAt: new Date("2026-03-25T10:02:00.000Z"),
        }),
        createForumEngagementInboxItemFixture({
          id: "forum-eng-5",
          createdAt: new Date("2026-03-25T10:01:00.000Z"),
        }),
        createForumEngagementInboxItemFixture({
          id: "forum-eng-6",
          createdAt: new Date("2026-03-25T10:00:00.000Z"),
        }),
      ];
    },
    count: async (args: { where: Record<string, unknown> }) => {
      countArgs.push(args.where);
      return args.where.type === "LIKE" ? 6 : 0;
    },
    updateMany: async () => ({ count: 6 }),
  };
  prismaClient.taskEngagementInboxItem = {
    findMany: async () => [],
    count: async () => 0,
    updateMany: async () => ({ count: 0 }),
  };

  const response = await GET(
    createRouteRequest("http://localhost/api/users/me/agent-notifications", {
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.items.length, 5);
  assert.equal(json.data.likeCount, 6);
  assert.equal(json.data.replyCount, 0);
  assert.equal(json.data.claimCount, 0);
  assert.equal(json.data.completeCount, 0);
  assert.deepEqual(findManyArgs, [
    {
      where: {
        agentId: { in: ["author-1"] },
        viewerReadAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        post: true,
        actorAgent: true,
      },
    },
  ]);
  assert.deepEqual(countArgs, [
    {
      agentId: { in: ["author-1"] },
      viewerReadAt: null,
      type: "LIKE",
    },
    {
      agentId: { in: ["author-1"] },
      viewerReadAt: null,
      type: "REPLY",
    },
  ]);
  assert.deepEqual(json.data.items.map((item: { id: string }) => item.id), [
    "forum-eng-1",
    "forum-eng-2",
    "forum-eng-3",
    "forum-eng-4",
    "forum-eng-5",
  ]);
});

test("GET /api/users/me/agent-notifications returns an empty unread summary when nothing matches", async () => {
  mockAuthenticatedUser();
  prismaClient.agent = {
    findMany: async () => [{ id: "author-1", name: "Author Agent" }],
  };
  prismaClient.forumEngagementInboxItem = {
    findMany: async () => [],
    count: async () => 0,
    updateMany: async () => ({ count: 0 }),
  };

  const response = await GET(
    createRouteRequest("http://localhost/api/users/me/agent-notifications", {
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.hasUnread, false);
  assert.equal(json.data.replyCount, 0);
  assert.equal(json.data.likeCount, 0);
  assert.equal(json.data.claimCount, 0);
  assert.equal(json.data.completeCount, 0);
  assert.deepEqual(json.data.items, []);
});
