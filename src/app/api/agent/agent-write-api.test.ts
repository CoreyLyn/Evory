import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentFixture,
  createForumPostFixture,
  createTaskFixture,
} from "@/test/factories";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { POST as createAgentForumPost } from "./forum/posts/route";
import { POST as publishAgentKnowledge } from "./knowledge/articles/route";
import { POST as claimAgentTask } from "./tasks/[id]/claim/route";
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
  forumPost: {
    create: AsyncMethod;
  };
  task: {
    create: AsyncMethod;
    findUnique: AsyncMethod;
    findUniqueOrThrow: AsyncMethod;
    updateMany: AsyncMethod;
  };
  knowledgeArticle: {
    create: AsyncMethod;
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
  forumPostCreate: prismaClient.forumPost.create,
  taskCreate: prismaClient.task.create,
  taskFindUnique: prismaClient.task.findUnique,
  taskFindUniqueOrThrow: prismaClient.task.findUniqueOrThrow,
  taskUpdateMany: prismaClient.task.updateMany,
  knowledgeArticleCreate: prismaClient.knowledgeArticle.create,
  pointTransactionCreate: prismaClient.pointTransaction.create,
  dailyCheckinFindUnique: prismaClient.dailyCheckin.findUnique,
  dailyCheckinUpsert: prismaClient.dailyCheckin.upsert,
  dailyCheckinUpdate: prismaClient.dailyCheckin.update,
  transaction: prismaClient.$transaction,
};

afterEach(() => {
  prismaClient.agent.findUnique = originalMethods.agentFindUnique;
  prismaClient.agent.update = originalMethods.agentUpdate;
  prismaClient.agent.updateMany = originalMethods.agentUpdateMany;
  prismaClient.forumPost.create = originalMethods.forumPostCreate;
  prismaClient.task.create = originalMethods.taskCreate;
  prismaClient.task.findUnique = originalMethods.taskFindUnique;
  prismaClient.task.findUniqueOrThrow = originalMethods.taskFindUniqueOrThrow;
  prismaClient.task.updateMany = originalMethods.taskUpdateMany;
  prismaClient.knowledgeArticle.create = originalMethods.knowledgeArticleCreate;
  prismaClient.pointTransaction.create = originalMethods.pointTransactionCreate;
  prismaClient.dailyCheckin.findUnique = originalMethods.dailyCheckinFindUnique;
  prismaClient.dailyCheckin.upsert = originalMethods.dailyCheckinUpsert;
  prismaClient.dailyCheckin.update = originalMethods.dailyCheckinUpdate;
  prismaClient.$transaction = originalMethods.transaction;
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
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "author-1",
      apiKey: "author-key",
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
  assert.equal(json.success, true);
  assert.equal(json.data.title, "Agent post");
});

test("unclaimed agents cannot use the official agent forum write endpoint", async () => {
  let createCalls = 0;

  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "author-1",
      apiKey: "author-key",
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
  assert.equal(json.error, "Unauthorized: Invalid or missing API key");
  assert.equal(createCalls, 0);
});

test("claimed agent can publish knowledge via the official agent knowledge endpoint", async () => {
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "writer-1",
      apiKey: "writer-key",
      name: "Writer",
    });
  prismaClient.knowledgeArticle.create = async ({
    data,
  }: {
    data: { agentId: string; title: string; content: string; tags: string[] };
  }) => ({
    id: "article-1",
    agentId: data.agentId,
    title: data.title,
    content: data.content,
    tags: data.tags,
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
    updatedAt: new Date("2026-03-10T00:00:00.000Z"),
    agent: createAgentFixture({
      id: data.agentId,
      apiKey: "writer-key",
      name: "Writer",
    }),
  });
  mockAwardPointsTransaction();

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

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.title, "Reusable fix");
});

test("claimed agent can create a task via the official agent task endpoint", async () => {
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "creator-1",
      apiKey: "creator-key",
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
  assert.equal(json.success, true);
  assert.equal(json.data.id, "task-1");
});

test("claimed agent can claim a task via the official agent task action endpoint", async () => {
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "claimer-1",
      apiKey: "claimer-key",
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
  assert.equal(json.success, true);
  assert.equal(json.data.status, "CLAIMED");
  assert.equal(json.data.assigneeId, "claimer-1");
});
