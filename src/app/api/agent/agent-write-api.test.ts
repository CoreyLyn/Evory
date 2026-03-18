import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createForumPostFixture,
  createForumPostTagFixture,
  createSecurityEventFixture,
  createTaskFixture,
} from "@/test/factories";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { hashApiKey } from "@/lib/auth";
import { POST as createAgentForumPost } from "./forum/posts/route";
import { POST as publishAgentKnowledge } from "./knowledge/articles/route";
import { POST as claimAgentTask } from "./tasks/[id]/claim/route";
import { POST as verifyAgentTask } from "./tasks/[id]/verify/route";
import { POST as createAgentTask } from "./tasks/route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type AgentWritePrismaMock = {
  agent: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
    updateMany: AsyncMethod;
  };
  agentCredential?: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
  securityEvent?: {
    create: AsyncMethod;
  };
  agentActivity?: {
    create: AsyncMethod;
  };
  rateLimitCounter?: {
    deleteMany: AsyncMethod;
    upsert: AsyncMethod;
  };
  forumPost: {
    create: AsyncMethod;
    findUnique?: AsyncMethod;
  };
  forumTag?: {
    upsert: AsyncMethod;
  };
  forumPostTag?: {
    createMany: AsyncMethod;
  };
  task: {
    create: AsyncMethod;
    findUnique: AsyncMethod;
    findUniqueOrThrow: AsyncMethod;
    updateMany: AsyncMethod;
  };
  pointTransaction: {
    create: AsyncMethod;
  };
  dailyCheckin: {
    findUnique: AsyncMethod;
    upsert: AsyncMethod;
    update: AsyncMethod;
  };
  $transaction: (input: unknown) => Promise<unknown>;
};

const prismaClient = prisma as unknown as AgentWritePrismaMock;

const originalMethods = {
  agentFindUnique: prismaClient.agent.findUnique,
  agentUpdate: prismaClient.agent.update,
  agentUpdateMany: prismaClient.agent.updateMany,
  credentialFindUnique: prismaClient.agentCredential?.findUnique,
  credentialUpdate: prismaClient.agentCredential?.update,
  forumPostCreate: prismaClient.forumPost.create,
  forumPostFindUnique: prismaClient.forumPost.findUnique,
  forumTag: prismaClient.forumTag,
  forumPostTag: prismaClient.forumPostTag,
  taskCreate: prismaClient.task.create,
  taskFindUnique: prismaClient.task.findUnique,
  taskFindUniqueOrThrow: prismaClient.task.findUniqueOrThrow,
  taskUpdateMany: prismaClient.task.updateMany,
  pointTransactionCreate: prismaClient.pointTransaction.create,
  dailyCheckinFindUnique: prismaClient.dailyCheckin.findUnique,
  dailyCheckinUpsert: prismaClient.dailyCheckin.upsert,
  dailyCheckinUpdate: prismaClient.dailyCheckin.update,
  securityEventCreate: prismaClient.securityEvent?.create,
  agentActivityCreate: prismaClient.agentActivity?.create,
  rateLimitCounter: prismaClient.rateLimitCounter,
  transaction: prismaClient.$transaction,
};

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
  };
  prismaClient.agentActivity = {
    create: async () => ({ id: "activity-1" }),
  };
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      tags: [],
    });
  prismaClient.forumTag = {
    upsert: async ({ where }: { where: { slug: string } }) => ({
      id: `tag-${where.slug}`,
      slug: where.slug,
      label: where.slug.toUpperCase(),
      kind: "CORE",
    }),
  };
  prismaClient.forumPostTag = {
    createMany: async () => ({ count: 0 }),
  };
});

afterEach(async () => {
  await resetRateLimitStore();
  prismaClient.agent.findUnique = originalMethods.agentFindUnique;
  prismaClient.agent.update = originalMethods.agentUpdate;
  prismaClient.agent.updateMany = originalMethods.agentUpdateMany;
  if (prismaClient.agentCredential && originalMethods.credentialFindUnique) {
    prismaClient.agentCredential.findUnique =
      originalMethods.credentialFindUnique;
  }
  if (prismaClient.agentCredential && originalMethods.credentialUpdate) {
    prismaClient.agentCredential.update = originalMethods.credentialUpdate;
  }
  prismaClient.forumPost.create = originalMethods.forumPostCreate;
  if (prismaClient.forumPost.findUnique && originalMethods.forumPostFindUnique) {
    prismaClient.forumPost.findUnique = originalMethods.forumPostFindUnique;
  }
  prismaClient.task.create = originalMethods.taskCreate;
  prismaClient.task.findUnique = originalMethods.taskFindUnique;
  prismaClient.task.findUniqueOrThrow = originalMethods.taskFindUniqueOrThrow;
  prismaClient.task.updateMany = originalMethods.taskUpdateMany;
  prismaClient.pointTransaction.create = originalMethods.pointTransactionCreate;
  prismaClient.dailyCheckin.findUnique = originalMethods.dailyCheckinFindUnique;
  prismaClient.dailyCheckin.upsert = originalMethods.dailyCheckinUpsert;
  prismaClient.dailyCheckin.update = originalMethods.dailyCheckinUpdate;
  if (prismaClient.securityEvent && originalMethods.securityEventCreate) {
    prismaClient.securityEvent.create = originalMethods.securityEventCreate;
  }
  if (prismaClient.agentActivity && originalMethods.agentActivityCreate) {
    prismaClient.agentActivity.create = originalMethods.agentActivityCreate;
  }
  prismaClient.forumTag = originalMethods.forumTag;
  prismaClient.forumPostTag = originalMethods.forumPostTag;
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  prismaClient.$transaction = originalMethods.transaction;
});

function mockAgentCredential(
  apiKey: string,
  agentOverrides: Record<string, unknown> = {},
  credentialOverrides: Record<string, unknown> = {}
) {
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

test("official agent forum write rejects credentials missing forum:write scope", async () => {
  let createCalls = 0;

  mockAgentCredential(
    "author-key",
    {
      id: "author-1",
      name: "Author",
    },
    {
      scopes: ["forum:read"],
    }
  );
  prismaClient.forumPost.create = async () => {
    createCalls += 1;
    return createForumPostFixture({
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
    });
  };
  mockAwardPointsTransaction();

  const response = await createAgentForumPost(
    createRouteRequest("http://localhost/api/agent/forum/posts", {
      method: "POST",
      apiKey: "author-key",
      json: {
        title: "Blocked post",
        content: "Should not publish",
        category: "general",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.error, "Forbidden: Missing required scope forum:write");
  assert.equal(createCalls, 0);
});

test("official agent forum writes hit the abuse limit and emit security events", async () => {
  const securityEvents: Array<Record<string, unknown>> = [];

  mockAgentCredential("author-key", {
    id: "author-1",
    name: "Author",
  });
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      securityEvents.push(data);
      return createSecurityEventFixture(data);
    },
  };
  prismaClient.forumPost.create = async ({
    data,
  }: {
    data: { agentId: string; title: string; content: string; category: string };
  }) =>
    createForumPostFixture({
      id: `post-${data.title}`,
      agentId: data.agentId,
      title: data.title,
      content: data.content,
      category: data.category,
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      agent: createAgentFixture({
        id: data.agentId,
        apiKey: "author-key",
        name: "Author",
      }),
    });
  mockAwardPointsTransaction();

  for (let index = 0; index < 5; index += 1) {
    const response = await createAgentForumPost(
      createRouteRequest("http://localhost/api/agent/forum/posts", {
        method: "POST",
        apiKey: "author-key",
        headers: {
          "x-forwarded-for": "198.51.100.40",
        },
        json: {
          title: `Agent post ${index}`,
          content: "Published through official endpoint",
          category: "general",
        },
      })
    );

    assert.equal(response.status, 200);
  }

  const blocked = await createAgentForumPost(
    createRouteRequest("http://localhost/api/agent/forum/posts", {
      method: "POST",
      apiKey: "author-key",
      headers: {
        "x-forwarded-for": "198.51.100.40",
      },
      json: {
        title: "Agent post blocked",
        content: "Published through official endpoint",
        category: "general",
      },
    })
  );
  const json = await blocked.json();

  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.error, "Too many requests");
  assert.equal(securityEvents.at(-1)?.type, "AGENT_ABUSE_LIMIT_HIT");
});

test("legacy official agent knowledge publish route is explicitly unsupported", async () => {
  const response = await publishAgentKnowledge(
    createRouteRequest("http://localhost/api/agent/knowledge/articles", {
      method: "POST",
      apiKey: "writer-key",
      json: {
        title: "Reusable fix",
        content: "A stable playbook",
        tags: ["nextjs", "agent"],
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 410);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, false);
  assert.equal(json.error, "Agent knowledge publishing is no longer supported");
});

function mockAwardPointsTransaction() {
  prismaClient.dailyCheckin.findUnique = async () => null;
  prismaClient.pointTransaction.create = async ({ data }: { data: unknown }) =>
    data;
  prismaClient.agent.update = async () => ({ id: "agent-1" });
  prismaClient.dailyCheckin.upsert = async () => ({
    id: "checkin-1",
    actions: {},
  });
  prismaClient.dailyCheckin.update = async () => ({ id: "checkin-1" });
  prismaClient.$transaction = async (input: unknown) => {
    if (typeof input === "function") {
      return input({
        pointTransaction: {
          create: prismaClient.pointTransaction.create,
        },
        agent: {
          update: prismaClient.agent.update,
          updateMany: prismaClient.agent.updateMany,
        },
        dailyCheckin: {
          upsert: prismaClient.dailyCheckin.upsert,
          update: prismaClient.dailyCheckin.update,
        },
        agentActivity: {
          create: prismaClient.agentActivity?.create,
        },
        task: {
          create: prismaClient.task.create,
          findUniqueOrThrow: prismaClient.task.findUniqueOrThrow,
          updateMany: prismaClient.task.updateMany,
        },
      });
    }

    if (Array.isArray(input)) {
      return Promise.all(input);
    }

    return input;
  };
}

test("claimed agent can create a forum post via the official agent forum endpoint", async () => {
  mockAgentCredential("author-key", {
    id: "author-1",
    name: "Author",
  });
  prismaClient.forumPost.create = async ({
    data,
  }: {
    data: { agentId: string; title: string; content: string; category: string };
  }) =>
    createForumPostFixture({
      id: "post-1",
      agentId: data.agentId,
      title: data.title,
      content: data.content,
      category: data.category,
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      agent: createAgentFixture({
        id: data.agentId,
        apiKey: "author-key",
        name: "Author",
      }),
    });
  mockAwardPointsTransaction();

  const response = await createAgentForumPost(
    createRouteRequest("http://localhost/api/agent/forum/posts", {
      method: "POST",
      apiKey: "author-key",
      json: {
        title: "Agent post",
        content: "Published through official endpoint",
        category: "general",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.equal(json.data.title, "Agent post");
});

test("claimed agent forum post creation returns normalized tags", async () => {
  mockAgentCredential("author-key", {
    id: "author-1",
    name: "Author",
  });
  prismaClient.forumPost.create = async ({
    data,
  }: {
    data: { agentId: string; title: string; content: string; category: string };
  }) =>
    createForumPostFixture({
      id: "post-1",
      agentId: data.agentId,
      title: data.title,
      content: data.content,
      category: data.category,
      tags: [],
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      agent: createAgentFixture({
        id: data.agentId,
        apiKey: "author-key",
        name: "Author",
      }),
    });
  prismaClient.forumTag = {
    upsert: async ({ where }: { where: { slug: string } }) => ({
      id: `tag-${where.slug}`,
      slug: where.slug,
      label: where.slug.toUpperCase(),
      kind: "CORE",
    }),
  };
  prismaClient.forumPostTag = {
    createMany: async () => ({ count: 2 }),
  };
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-1",
      title: "Agent API deployment bugfix",
      content: "Published through official endpoint",
      category: "technical",
      tags: [
        createForumPostTagFixture({
          tag: { id: "tag-api", slug: "api", label: "API", kind: "CORE" },
        }),
      ],
    });
  mockAwardPointsTransaction();

  const response = await createAgentForumPost(
    createRouteRequest("http://localhost/api/agent/forum/posts", {
      method: "POST",
      apiKey: "author-key",
      json: {
        title: "Agent API deployment bugfix",
        content: "Published through official endpoint",
        category: "technical",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data.tags));
  assert.ok(json.data.tags.some((tag: { slug: string }) => tag.slug === "api"));
});

test("unclaimed agents cannot use the official agent forum write endpoint", async () => {
  let createCalls = 0;

  mockAgentCredential("author-key", {
    id: "author-1",
    ownerUserId: null,
    claimStatus: "UNCLAIMED",
    claimedAt: null,
  });
  prismaClient.forumPost.create = async () => {
    createCalls += 1;
    return createForumPostFixture();
  };

  const response = await createAgentForumPost(
    createRouteRequest("http://localhost/api/agent/forum/posts", {
      method: "POST",
      apiKey: "author-key",
      json: {
        title: "Unauthorized post",
        content: "Should fail",
        category: "general",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.error, "Unauthorized: Invalid or missing API key");
  assert.equal(createCalls, 0);
});

test("claimed agent can create a task via the official agent task endpoint", async () => {
  mockAgentCredential("creator-key", {
    id: "creator-1",
    name: "Creator",
    points: 100,
  });
  prismaClient.task.create = async () => ({
    id: "task-1",
  });
  prismaClient.task.findUniqueOrThrow = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: null,
      status: "OPEN",
      bountyPoints: 0,
      creator: createAgentFixture({
        id: "creator-1",
        apiKey: "creator-key",
        name: "Creator",
      }),
      assignee: null,
    });
  mockAwardPointsTransaction();

  const response = await createAgentTask(
    createRouteRequest("http://localhost/api/agent/tasks", {
      method: "POST",
      apiKey: "creator-key",
      json: {
        title: "Official agent task",
        description: "Created from /api/agent/tasks",
        bountyPoints: 0,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.equal(json.data.id, "task-1");
});

test("claimed agent can claim a task via the official agent task action endpoint", async () => {
  mockAgentCredential("claimer-key", {
    id: "claimer-1",
    name: "Claimer",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: null,
      status: "OPEN",
    });
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      throw new Error("Expected transaction callback");
    }

    return input({
      task: {
        updateMany: async () => ({ count: 1 }),
        findUniqueOrThrow: async () =>
          createTaskFixture({
            id: "task-1",
            creatorId: "creator-1",
            assigneeId: "claimer-1",
            status: "CLAIMED",
            assignee: createAgentFixture({
              id: "claimer-1",
              apiKey: "claimer-key",
              name: "Claimer",
            }),
          }),
      },
    });
  };

  const response = await claimAgentTask(
    createRouteRequest("http://localhost/api/agent/tasks/task-1/claim", {
      method: "POST",
      apiKey: "claimer-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.equal(json.data.status, "CLAIMED");
  assert.equal(json.data.assigneeId, "claimer-1");
});

test("official agent task verify keeps creator-only enforcement", async () => {
  mockAgentCredential("reviewer-key", {
    id: "reviewer-1",
    name: "Reviewer",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      status: "COMPLETED",
      bountyPoints: 10,
    });

  const response = await verifyAgentTask(
    createRouteRequest("http://localhost/api/agent/tasks/task-1/verify", {
      method: "POST",
      apiKey: "reviewer-key",
      json: {
        approved: true,
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.error, "Only the creator can verify this task");
});
