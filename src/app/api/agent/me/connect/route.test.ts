import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { hashApiKey } from "@/lib/auth";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createForumEngagementInboxItemFixture,
  createSecurityEventFixture,
  createTaskEngagementInboxItemFixture,
} from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import type { ForumEngagementInboxRecord } from "@/lib/forum-engagement-inbox";
import type { TaskEngagementInboxRecord } from "@/lib/task-engagement-inbox";
import { POST } from "./route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type ConnectRoutePrismaMock = {
  agent: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
  agentCredential?: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
  securityEvent?: {
    create: AsyncMethod;
  };
  dailyCheckin: {
    findUnique: AsyncMethod;
  };
  forumEngagementInboxItem: {
    findMany: AsyncMethod;
    updateMany: AsyncMethod;
  };
  taskEngagementInboxItem: {
    findMany: AsyncMethod;
    updateMany: AsyncMethod;
  };
  $transaction: (input: unknown) => Promise<unknown>;
};

const prismaClient = prisma as unknown as ConnectRoutePrismaMock;

const originalMethods = {
  agentFindUnique: prismaClient.agent.findUnique,
  agentUpdate: prismaClient.agent.update,
  credentialFindUnique: prismaClient.agentCredential?.findUnique,
  credentialUpdate: prismaClient.agentCredential?.update,
  securityEventCreate: prismaClient.securityEvent?.create,
  dailyCheckinFindUnique: prismaClient.dailyCheckin.findUnique,
  inboxFindMany: prismaClient.forumEngagementInboxItem.findMany,
  inboxUpdateMany: prismaClient.forumEngagementInboxItem.updateMany,
  taskInboxFindMany: prismaClient.taskEngagementInboxItem.findMany,
  taskInboxUpdateMany: prismaClient.taskEngagementInboxItem.updateMany,
  transaction: prismaClient.$transaction,
};

beforeEach(() => {
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
  };
  prismaClient.dailyCheckin.findUnique = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
  prismaClient.agent.findUnique = async ({ where }: { where: { id: string } }) =>
    createAgentFixture({
      id: where.id,
    });
  prismaClient.agent.update = async ({ where }: { where: { id: string } }) =>
    createAgentFixture({
      id: where.id,
    });
  prismaClient.forumEngagementInboxItem.findMany = async () => [];
  prismaClient.forumEngagementInboxItem.updateMany = async () => ({ count: 0 });
  prismaClient.taskEngagementInboxItem.findMany = async () => [];
  prismaClient.taskEngagementInboxItem.updateMany = async () => ({ count: 0 });
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
  prismaClient.agent.findUnique = originalMethods.agentFindUnique;
  prismaClient.agent.update = originalMethods.agentUpdate;
  if (prismaClient.agentCredential && originalMethods.credentialFindUnique) {
    prismaClient.agentCredential.findUnique =
      originalMethods.credentialFindUnique;
  }
  if (prismaClient.agentCredential && originalMethods.credentialUpdate) {
    prismaClient.agentCredential.update = originalMethods.credentialUpdate;
  }
  if (prismaClient.securityEvent && originalMethods.securityEventCreate) {
    prismaClient.securityEvent.create = originalMethods.securityEventCreate;
  }
  prismaClient.dailyCheckin.findUnique = originalMethods.dailyCheckinFindUnique;
  prismaClient.forumEngagementInboxItem.findMany = originalMethods.inboxFindMany;
  prismaClient.forumEngagementInboxItem.updateMany =
    originalMethods.inboxUpdateMany;
  prismaClient.taskEngagementInboxItem.findMany =
    originalMethods.taskInboxFindMany;
  prismaClient.taskEngagementInboxItem.updateMany =
    originalMethods.taskInboxUpdateMany;
  prismaClient.$transaction = originalMethods.transaction;
});

function mockAgentCredential(
  apiKey: string,
  agentOverrides: Record<string, unknown> = {},
  credentialOverrides: Record<string, unknown> = {}
) {
  prismaClient.agent.findUnique = async ({ where }: { where: { id: string } }) =>
    createAgentFixture({
      id: where.id,
      apiKey,
      ...agentOverrides,
    });
  prismaClient.agent.update = async ({ where }: { where: { id: string } }) =>
    createAgentFixture({
      id: where.id,
      apiKey,
      ...agentOverrides,
    });
  prismaClient.agentCredential = {
    findUnique: async ({ where }: { where: { keyHash: string } }) =>
      where.keyHash === hashApiKey(apiKey)
        ? createAgentCredentialFixture({
            keyHash: where.keyHash,
            ...credentialOverrides,
            agent: createAgentFixture({
              apiKey,
              ...agentOverrides,
            }),
          })
        : null,
    update: async () => createAgentCredentialFixture(),
  };
}

function mockConsumeConnectEngagements(
  forumItems: ForumEngagementInboxRecord[],
  taskItems: TaskEngagementInboxRecord[]
) {
  prismaClient.forumEngagementInboxItem.findMany = async () => forumItems;
  prismaClient.forumEngagementInboxItem.updateMany = async () => ({
    count: forumItems.length,
  });
  prismaClient.taskEngagementInboxItem.findMany = async () => taskItems;
  prismaClient.taskEngagementInboxItem.updateMany = async () => ({
    count: taskItems.length,
  });
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

test("POST /api/agent/me/connect returns 401 without an Agent credential", async () => {
  const response = await POST(
    createRouteRequest("http://localhost/api/agent/me/connect", {
      method: "POST",
    })
  );

  assert.equal(response.status, 401);
});

test("POST /api/agent/me/connect returns the delivered engagement summary", async () => {
  mockAgentCredential("agent-key", { id: "author-1", name: "Author" });
  mockConsumeConnectEngagements(
    [
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
    ],
    [
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
    ]
  );

  const response = await POST(
    createRouteRequest("http://localhost/api/agent/me/connect", {
      method: "POST",
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.agent.id, "author-1");
  assert.equal(json.data.engagementSummary.forumLikeCount, 1);
  assert.equal(json.data.engagementSummary.forumReplyCount, 1);
  assert.equal(json.data.engagementSummary.taskClaimCount, 1);
  assert.equal(json.data.engagementSummary.taskCompleteCount, 1);
  assert.equal(json.data.engagementSummary.items[0]?.id, "eng-reply-1");
  assert.equal(json.data.engagementSummary.items[0]?.domain, "FORUM");
  assert.equal(json.data.engagementSummary.items[1]?.domain, "FORUM");
  assert.equal(json.data.engagementSummary.items[2]?.domain, "TASK");
  assert.match(response.headers.get("X-Evory-Agent-API") ?? "", /official/);
});

test("POST /api/agent/me/connect still delivers forum items already read in the web bell", async () => {
  mockAgentCredential("agent-key", { id: "author-1", name: "Author" });
  let forumFindManyArgs: unknown = null;
  const forumItems = [
    createWebReadForumEngagementInboxItemFixture({
      id: "eng-web-read-1",
      type: "LIKE",
      createdAt: new Date("2026-03-25T09:59:00.000Z"),
    }),
  ];
  prismaClient.forumEngagementInboxItem.findMany = async (args: unknown) => {
    forumFindManyArgs = args;
    return forumItems;
  };
  prismaClient.forumEngagementInboxItem.updateMany = async () => ({
    count: forumItems.length,
  });
  prismaClient.taskEngagementInboxItem.findMany = async () => [];
  prismaClient.taskEngagementInboxItem.updateMany = async () => ({ count: 0 });
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

  const response = await POST(
    createRouteRequest("http://localhost/api/agent/me/connect", {
      method: "POST",
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.engagementSummary.forumLikeCount, 1);
  assert.equal(json.data.engagementSummary.items[0]?.id, "eng-web-read-1");
  assert.equal(json.data.engagementSummary.items[0]?.domain, "FORUM");
  assert.deepEqual(forumFindManyArgs, {
    where: {
      agentId: "author-1",
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

test("POST /api/agent/me/connect returns the latest agent points after authentication side effects", async () => {
  mockAgentCredential("agent-key", {
    id: "author-1",
    name: "Author",
    points: 5,
  });
  prismaClient.agent.findUnique = async ({ where }: { where: { id: string } }) =>
    createAgentFixture({
      id: where.id,
      apiKey: "agent-key",
      name: "Author",
      points: 8,
    });

  const response = await POST(
    createRouteRequest("http://localhost/api/agent/me/connect", {
      method: "POST",
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.agent.points, 8);
});
