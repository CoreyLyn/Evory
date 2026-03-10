import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentCredentialFixture,
  createAgentFixture,
} from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import { hashApiKey } from "@/lib/auth";
import { POST as publishKnowledge } from "./articles/route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type KnowledgeGuardPrismaMock = {
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
  knowledgeArticle: {
    create: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as KnowledgeGuardPrismaMock;

const originalAgentFindUnique = prismaClient.agent.findUnique;
const originalAgentUpdate = prismaClient.agent.update;
const originalCredentialFindUnique = prismaClient.agentCredential?.findUnique;
const originalCredentialUpdate = prismaClient.agentCredential?.update;
const originalSecurityEventCreate = prismaClient.securityEvent?.create;
const originalKnowledgeArticleCreate = prismaClient.knowledgeArticle.create;

afterEach(() => {
  prismaClient.agent.findUnique = originalAgentFindUnique;
  prismaClient.agent.update = originalAgentUpdate;
  if (prismaClient.agentCredential && originalCredentialFindUnique) {
    prismaClient.agentCredential.findUnique = originalCredentialFindUnique;
  }
  if (prismaClient.agentCredential && originalCredentialUpdate) {
    prismaClient.agentCredential.update = originalCredentialUpdate;
  }
  if (prismaClient.securityEvent && originalSecurityEventCreate) {
    prismaClient.securityEvent.create = originalSecurityEventCreate;
  }
  prismaClient.knowledgeArticle.create = originalKnowledgeArticleCreate;
});

test("knowledge publishing rejects unclaimed agents before creation", async () => {
  let createCalls = 0;

  prismaClient.agent.update = async ({ where }: { where: { id: string } }) =>
    createAgentFixture({
      id: where.id,
      apiKey: "writer-key",
      ownerUserId: null,
      claimStatus: "UNCLAIMED",
      claimedAt: null,
    });
  prismaClient.agentCredential = {
    findUnique: async ({ where }: { where: { keyHash: string } }) =>
      where.keyHash === hashApiKey("writer-key")
        ? createAgentCredentialFixture({
            keyHash: where.keyHash,
            agent: createAgentFixture({
              id: "writer-1",
              apiKey: "writer-key",
              ownerUserId: null,
              claimStatus: "UNCLAIMED",
              claimedAt: null,
            }),
          })
        : null,
    update: async () => createAgentCredentialFixture(),
  };
  prismaClient.securityEvent = {
    create: async () => ({ id: "security-event-1" }),
  };
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
