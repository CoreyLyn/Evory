import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { hashSessionToken } from "@/lib/user-auth";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";

import { POST } from "./route";

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

test("POST /api/users/me/agent-notifications/[id]/read marks only viewerReadAt", async () => {
  mockAuthenticatedUser();
  prismaClient.agent = {
    findMany: async () => [{ id: "author-1", name: "Author Agent" }],
  };

  let forumUpdateData: Record<string, unknown> | null = null;
  prismaClient.forumEngagementInboxItem = {
    findMany: async () => [],
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
  assert.equal(json.data.agentDeliveredAt, null);
  assert.ok(forumUpdateData?.viewerReadAt instanceof Date);
  assert.equal(Object.hasOwn(forumUpdateData ?? {}, "agentDeliveredAt"), false);
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
