import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createTaskEngagementInboxItemFixture } from "@/test/factories";
import { hashSessionToken } from "@/lib/user-auth";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";

import { POST } from "./[id]/read/route";

type OwnedAgentNotificationReadPrismaMock = {
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

const prismaClient = prisma as unknown as OwnedAgentNotificationReadPrismaMock;
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

test("POST /api/users/me/agent-notifications/[id]/read returns 401 without auth", async () => {
  const response = await POST(
    createRouteRequest(
      "http://localhost/api/users/me/agent-notifications/forum-eng-1/read",
      {
        method: "POST",
      }
    ),
    createRouteParams({ id: "forum-eng-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("POST /api/users/me/agent-notifications/[id]/read marks a forum item and preserves agentDeliveredAt", async () => {
  mockAuthenticatedUser();
  prismaClient.agent = {
    findMany: async () => [{ id: "author-1", name: "Author Agent" }],
  };

  let forumUpdateData: Record<string, unknown> | null = null;
  prismaClient.forumEngagementInboxItem = {
    findMany: async () => [
      {
        id: "forum-eng-1",
        agentId: "author-1",
        postId: "post-1",
        type: "REPLY",
        actorAgentId: "actor-1",
        replyId: "reply-1",
        replyPreview: "Useful reply",
        createdAt: new Date("2026-03-25T09:59:00.000Z"),
        viewerReadAt: null,
        agentDeliveredAt: new Date("2026-03-24T10:00:00.000Z"),
        post: {
          id: "post-1",
          title: "Forum post",
        },
        actorAgent: {
          id: "actor-1",
          name: "Forum Actor",
          type: "CODEX",
        },
      },
    ],
    updateMany: async ({ data }: { data: Record<string, unknown> }) => {
      forumUpdateData = data;
      return { count: 1 };
    },
  };

  const response = await POST(
    createRouteRequest(
      "http://localhost/api/users/me/agent-notifications/forum-eng-1/read",
      {
        method: "POST",
        headers: {
          cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        },
      }
    ),
    createRouteParams({ id: "forum-eng-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(
    json.data.viewerReadAt,
    forumUpdateData?.viewerReadAt instanceof Date
      ? forumUpdateData.viewerReadAt.toISOString()
      : null
  );
  assert.equal(json.data.agentDeliveredAt, "2026-03-24T10:00:00.000Z");
  assert.ok(forumUpdateData?.viewerReadAt instanceof Date);
  assert.equal(Object.hasOwn(forumUpdateData ?? {}, "agentDeliveredAt"), false);
});

test("POST /api/users/me/agent-notifications/[id]/read marks a task item through the task branch", async () => {
  mockAuthenticatedUser();
  prismaClient.agent = {
    findMany: async () => [{ id: "creator-1", name: "Creator Agent" }],
  };

  let taskUpdateData: Record<string, unknown> | null = null;
  prismaClient.taskEngagementInboxItem = {
    findMany: async () => [
      createTaskEngagementInboxItemFixture({
        id: "task-eng-1",
        agentId: "creator-1",
        type: "CLAIMED",
        createdAt: new Date("2026-03-25T09:58:00.000Z"),
        viewerReadAt: null,
        agentDeliveredAt: new Date("2026-03-24T10:00:00.000Z"),
        task: {
          id: "task-1",
          title: "Task title",
        },
        actorAgent: {
          id: "actor-1",
          name: "Task Actor",
          type: "CUSTOM",
        },
      }),
    ],
    updateMany: async ({ data }: { data: Record<string, unknown> }) => {
      taskUpdateData = data;
      return { count: 1 };
    },
  };

  const response = await POST(
    createRouteRequest(
      "http://localhost/api/users/me/agent-notifications/task-eng-1/read",
      {
        method: "POST",
        headers: {
          cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        },
      }
    ),
    createRouteParams({ id: "task-eng-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(
    json.data.viewerReadAt,
    taskUpdateData?.viewerReadAt instanceof Date
      ? taskUpdateData.viewerReadAt.toISOString()
      : null
  );
  assert.equal(json.data.agentDeliveredAt, "2026-03-24T10:00:00.000Z");
  assert.ok(taskUpdateData?.viewerReadAt instanceof Date);
  assert.equal(Object.hasOwn(taskUpdateData ?? {}, "agentDeliveredAt"), false);
});

test("POST /api/users/me/agent-notifications/[id]/read returns an already-read owned item", async () => {
  mockAuthenticatedUser();
  prismaClient.agent = {
    findMany: async () => [{ id: "author-1", name: "Author Agent" }],
  };

  prismaClient.forumEngagementInboxItem = {
    findMany: async () => [
      {
        id: "forum-eng-1",
        agentId: "author-1",
        postId: "post-1",
        type: "REPLY",
        actorAgentId: "actor-1",
        replyId: "reply-1",
        replyPreview: "Useful reply",
        createdAt: new Date("2026-03-25T09:59:00.000Z"),
        viewerReadAt: new Date("2026-03-24T09:59:00.000Z"),
        agentDeliveredAt: new Date("2026-03-24T10:00:00.000Z"),
        post: {
          id: "post-1",
          title: "Forum post",
        },
        actorAgent: {
          id: "actor-1",
          name: "Forum Actor",
          type: "CODEX",
        },
      },
    ],
    updateMany: async () => ({ count: 0 }),
  };
  prismaClient.taskEngagementInboxItem = {
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  };

  const response = await POST(
    createRouteRequest(
      "http://localhost/api/users/me/agent-notifications/forum-eng-1/read",
      {
        method: "POST",
        headers: {
          cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        },
      }
    ),
    createRouteParams({ id: "forum-eng-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.viewerReadAt, "2026-03-24T09:59:00.000Z");
  assert.equal(json.data.agentDeliveredAt, "2026-03-24T10:00:00.000Z");
});

test("POST /api/users/me/agent-notifications/[id]/read returns 404 for a foreign item", async () => {
  mockAuthenticatedUser();
  prismaClient.agent = {
    findMany: async () => [{ id: "author-1", name: "Author Agent" }],
  };

  prismaClient.forumEngagementInboxItem = {
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  };
  prismaClient.taskEngagementInboxItem = {
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  };

  const response = await POST(
    createRouteRequest(
      "http://localhost/api/users/me/agent-notifications/foreign-item/read",
      {
        method: "POST",
        headers: {
          cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        },
      }
    ),
    createRouteParams({ id: "foreign-item" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Notification not found");
});
