import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createAvatarConfigFixture,
  createPointTransactionFixture,
  createUserFixture,
} from "@/test/factories";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { hashApiKey } from "@/lib/auth";
import { GET as getAgentDetail } from "./[id]/route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type AgentDetailPrismaMock = {
  agent: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
  agentCredential?: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
  forumPost: {
    count: AsyncMethod;
  };
  task: {
    count: AsyncMethod;
  };
  pointTransaction: {
    findMany: AsyncMethod;
  };
  agentInventory: {
    findMany: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as AgentDetailPrismaMock;

const originalMethods = {
  agentFindUnique: prismaClient.agent.findUnique,
  agentUpdate: prismaClient.agent.update,
  credentialFindUnique: prismaClient.agentCredential?.findUnique,
  credentialUpdate: prismaClient.agentCredential?.update,
  forumPostCount: prismaClient.forumPost.count,
  taskCount: prismaClient.task.count,
  pointTransactionFindMany: prismaClient.pointTransaction.findMany,
  agentInventoryFindMany: prismaClient.agentInventory.findMany,
};

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
  prismaClient.forumPost.count = originalMethods.forumPostCount;
  prismaClient.task.count = originalMethods.taskCount;
  prismaClient.pointTransaction.findMany =
    originalMethods.pointTransactionFindMany;
  prismaClient.agentInventory.findMany = originalMethods.agentInventoryFindMany;
});

function mockAgentCredential(
  apiKey: string,
  overrides: Record<string, unknown> = {}
) {
  prismaClient.agent.update = async ({ where }: { where: { id: string } }) =>
    createAgentFixture({
      id: where.id,
      apiKey,
      ...overrides,
    });
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
    update: async () => createAgentCredentialFixture(),
  };
}

test("agent detail returns public profile and aggregate counts", async () => {
  prismaClient.agent.findUnique = async ({ where }) => {
    if (where?.id === "agent-1") {
      return createAgentFixture({
        id: "agent-1",
        name: "Alpha",
        type: "OPENCLAW",
        status: "WORKING",
        points: 120,
        bio: "Builds product features",
        avatarConfig: createAvatarConfigFixture({ hat: "crown" }),
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-07T00:00:00.000Z"),
      });
    }

    return null;
  };
  prismaClient.forumPost.count = async () => 12;
  prismaClient.task.count = async ({ where }) =>
    where?.creatorId === "agent-1" ? 4 : 9;
  prismaClient.pointTransaction.findMany = async () => [];
  prismaClient.agentInventory.findMany = async () => [
    {
      item: {
        id: "crown",
        name: "Crown",
        type: "hat",
        category: "hat",
        spriteKey: "crown",
      },
    },
  ];

  const response = await getAgentDetail(
    createRouteRequest("http://localhost/api/agents/agent-1"),
    createRouteParams({ id: "agent-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.profile.name, "Alpha");
  assert.equal(json.data.counts.posts, 12);
  assert.equal("articles" in json.data.counts, false);
  assert.equal(json.data.counts.createdTasks, 4);
  assert.equal(json.data.counts.assignedTasks, 9);
  assert.equal(json.data.equippedItems.length, 1);
  assert.equal(json.data.viewer.isSelf, false);
  assert.equal(json.data.recentPointHistory, null);
});

test("agent detail includes recent point transactions for self when authenticated", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
  });
  prismaClient.agent.findUnique = async ({ where }) => {
    if (where?.id === "agent-1") {
      return createAgentFixture({
        id: "agent-1",
        name: "Alpha",
        type: "OPENCLAW",
        status: "TASKBOARD",
        points: 150,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-07T00:00:00.000Z"),
      });
    }

    return null;
  };
  prismaClient.forumPost.count = async () => 0;
  prismaClient.task.count = async () => 0;
  prismaClient.agentInventory.findMany = async () => [];
  prismaClient.pointTransaction.findMany = async () => [
    createPointTransactionFixture({
      id: "txn-2",
      amount: 30,
      type: "COMPLETE_TASK",
      description: "Completed task",
      createdAt: new Date("2026-03-07T00:00:00.000Z"),
    }),
    createPointTransactionFixture({
      id: "txn-1",
      amount: -10,
      type: "SHOP_PURCHASE",
      description: "Bought crown",
      createdAt: new Date("2026-03-06T00:00:00.000Z"),
    }),
  ];

  const response = await getAgentDetail(
    createRouteRequest("http://localhost/api/agents/agent-1", {
      apiKey: "agent-key",
    }),
    createRouteParams({ id: "agent-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.viewer.isSelf, true);
  assert.equal(json.data.recentPointHistory.length, 2);
  assert.equal(json.data.recentPointHistory[0].type, "COMPLETE_TASK");
  assert.equal(json.data.recentPointHistory[1].type, "SHOP_PURCHASE");
});

test("agent detail returns optional public owner data", async () => {
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "agent-1",
      showOwnerInPublic: true,
      owner: createUserFixture({
        id: "user-1",
        name: "",
        email: "owner@example.com",
      }),
    });
  prismaClient.forumPost.count = async () => 0;
  prismaClient.task.count = async () => 0;
  prismaClient.pointTransaction.findMany = async () => [];
  prismaClient.agentInventory.findMany = async () => [];

  const response = await getAgentDetail(
    createRouteRequest("http://localhost/api/agents/agent-1"),
    createRouteParams({ id: "agent-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(json.data.profile.owner, {
    id: "user-1",
    displayName: "own***@example.com",
  });
});
