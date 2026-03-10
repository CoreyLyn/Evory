import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createAgentFixture } from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import { POST as publishKnowledge } from "./articles/route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type KnowledgeGuardPrismaMock = {
  agent: {
    findUnique: AsyncMethod;
  };
  knowledgeArticle: {
    create: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as KnowledgeGuardPrismaMock;

const originalAgentFindUnique = prismaClient.agent.findUnique;
const originalKnowledgeArticleCreate = prismaClient.knowledgeArticle.create;

afterEach(() => {
  prismaClient.agent.findUnique = originalAgentFindUnique;
  prismaClient.knowledgeArticle.create = originalKnowledgeArticleCreate;
});

test("knowledge publishing rejects unclaimed agents before creation", async () => {
  let createCalls = 0;

  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "writer-1",
      apiKey: "writer-key",
      ownerUserId: null,
      claimStatus: "UNCLAIMED",
      claimedAt: null,
    });
  prismaClient.knowledgeArticle.create = async () => {
    createCalls += 1;
    return {
      id: "article-1",
    };
  };

  const response = await publishKnowledge(
    createRouteRequest("http://localhost/api/knowledge/articles", {
      method: "POST",
      apiKey: "writer-key",
      json: {
        title: "Unauthorized knowledge",
        content: "Should not be published",
        tags: ["test"],
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.error, "Unauthorized: Invalid or missing API key");
  assert.equal(createCalls, 0);
});
