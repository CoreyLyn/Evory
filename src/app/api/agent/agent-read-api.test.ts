import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createForumPostFixture,
  createTaskFixture,
} from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import { hashApiKey } from "@/lib/auth";
import { GET as getAgentForumPosts } from "./forum/posts/route";
import { GET as getAgentKnowledgeSearch } from "./knowledge/search/route";
import { GET as getAgentTasks } from "./tasks/route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type AgentReadPrismaMock = {
  agent: {
    findUnique: AsyncMethod;
    findMany: AsyncMethod;
    count?: AsyncMethod;
  };
  agentCredential?: {
    findUnique: AsyncMethod;
  };
  task: {
    findMany: AsyncMethod;
    count: AsyncMethod;
  };
  forumPost: {
    findMany: AsyncMethod;
    count: AsyncMethod;
  };
  knowledgeArticle: {
    findMany: AsyncMethod;
    count: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as AgentReadPrismaMock;
const originalAgentFindUnique = prismaClient.agent.findUnique;
const originalAgentFindMany = prismaClient.agent.findMany;
const originalCredentialFindUnique = prismaClient.agentCredential?.findUnique;
const originalTaskFindMany = prismaClient.task.findMany;
const originalTaskCount = prismaClient.task.count;
const originalForumPostFindMany = prismaClient.forumPost.findMany;
const originalForumPostCount = prismaClient.forumPost.count;
const originalKnowledgeArticleFindMany = prismaClient.knowledgeArticle.findMany;
const originalKnowledgeArticleCount = prismaClient.knowledgeArticle.count;

afterEach(() => {
  prismaClient.agent.findUnique = originalAgentFindUnique;
  prismaClient.agent.findMany = originalAgentFindMany;
  if (prismaClient.agentCredential && originalCredentialFindUnique) {
    prismaClient.agentCredential.findUnique = originalCredentialFindUnique;
  }
  prismaClient.task.findMany = originalTaskFindMany;
  prismaClient.task.count = originalTaskCount;
  prismaClient.forumPost.findMany = originalForumPostFindMany;
  prismaClient.forumPost.count = originalForumPostCount;
  prismaClient.knowledgeArticle.findMany = originalKnowledgeArticleFindMany;
  prismaClient.knowledgeArticle.count = originalKnowledgeArticleCount;
});

function mockAgentCredential(
  apiKey: string,
  overrides: Record<string, unknown> = {}
) {
  prismaClient.agentCredential = {
    findUnique: async ({ where }: { where: { keyHash: string } }) =>
      where.keyHash === hashApiKey(apiKey)
        ? createAgentCredentialFixture({
            keyHash: where.keyHash,
            agent: createAgentFixture({
              apiKey,
              ...overrides,
            }),
          })
        : null,
  };
}

test("claimed agent can read the official task feed", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });
  prismaClient.task.findMany = async () => [
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: null,
      status: "OPEN",
    }),
  ];
  prismaClient.task.count = async () => 1;
  prismaClient.agent.findMany = async () => [
    createAgentFixture({
      id: "creator-1",
      name: "Creator",
    }),
  ];

  const response = await getAgentTasks(
    createRouteRequest("http://localhost/api/agent/tasks", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.length, 1);
  assert.equal(json.data[0].id, "task-1");
});

test("claimed agent can read the official forum feed", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });
  prismaClient.forumPost.findMany = async () => [
    createForumPostFixture({
      id: "post-1",
      title: "Agent forum post",
    }),
  ];
  prismaClient.forumPost.count = async () => 1;

  const response = await getAgentForumPosts(
    createRouteRequest("http://localhost/api/agent/forum/posts", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.length, 1);
  assert.equal(json.data[0].id, "post-1");
});

test("unclaimed agents cannot use the official knowledge search endpoint", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: null,
    claimStatus: "UNCLAIMED",
    claimedAt: null,
  });
  prismaClient.knowledgeArticle.findMany = async () => [];
  prismaClient.knowledgeArticle.count = async () => 0;

  const response = await getAgentKnowledgeSearch(
    createRouteRequest("http://localhost/api/agent/knowledge/search?q=test", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.error, "Unauthorized: Invalid or missing API key");
});
