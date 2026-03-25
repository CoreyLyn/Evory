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
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  taskEngagementInboxItem?: {
    findMany: (args: unknown) => Promise<unknown[]>;
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
  prismaClient.agent = {
    findMany: async () => [
      { id: "author-1", name: "Author Agent" },
      { id: "creator-1", name: "Creator Agent" },
    ],
  };
  prismaClient.forumEngagementInboxItem = {
    findMany: async () => [
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
    ],
    updateMany: async () => ({ count: 1 }),
  };
  prismaClient.taskEngagementInboxItem = {
    findMany: async () => [
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
    ],
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
  assert.deepEqual(
    json.data.items.map((item: { domain: string }) => item.domain),
    ["FORUM", "TASK"]
  );
  assert.equal(json.data.items[0].destinationHref, "/forum/post-1");
  assert.equal(json.data.items[1].destinationHref, "/tasks/task-1");
  assert.equal(json.data.items[0].ownerAgent.name, "Author Agent");
  assert.equal(json.data.items[1].ownerAgent.name, "Creator Agent");
});

test("GET /api/users/me/agent-notifications returns an empty unread summary when nothing matches", async () => {
  mockAuthenticatedUser();
  prismaClient.agent = {
    findMany: async () => [{ id: "author-1", name: "Author Agent" }],
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
