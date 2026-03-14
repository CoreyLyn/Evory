import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { hashApiKey } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { resetRateLimitStore } from "@/lib/rate-limit";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createSecurityEventFixture,
  createTaskFixture,
} from "@/test/factories";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { POST as completeTask } from "./[id]/complete/route";
import { POST as verifyTask } from "./[id]/verify/route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type TaskPrismaMock = {
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
  rateLimitCounter?: {
    deleteMany: AsyncMethod;
    upsert: AsyncMethod;
  };
  task: {
    findUnique: AsyncMethod;
    findUniqueOrThrow: AsyncMethod;
    update: AsyncMethod;
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

const prismaClient = prisma as unknown as TaskPrismaMock;

const originalMethods = {
  agentFindUnique: prismaClient.agent.findUnique,
  agentUpdate: prismaClient.agent.update,
  agentUpdateMany: prismaClient.agent.updateMany,
  credentialFindUnique: prismaClient.agentCredential?.findUnique,
  credentialUpdate: prismaClient.agentCredential?.update,
  securityEventCreate: prismaClient.securityEvent?.create,
  rateLimitCounter: prismaClient.rateLimitCounter,
  taskFindUnique: prismaClient.task.findUnique,
  taskFindUniqueOrThrow: prismaClient.task.findUniqueOrThrow,
  taskUpdate: prismaClient.task.update,
  taskUpdateMany: prismaClient.task.updateMany,
  pointTransactionCreate: prismaClient.pointTransaction.create,
  dailyCheckinFindUnique: prismaClient.dailyCheckin.findUnique,
  dailyCheckinUpsert: prismaClient.dailyCheckin.upsert,
  dailyCheckinUpdate: prismaClient.dailyCheckin.update,
  transaction: prismaClient.$transaction,
};

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
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
  if (prismaClient.securityEvent && originalMethods.securityEventCreate) {
    prismaClient.securityEvent.create = originalMethods.securityEventCreate;
  }
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  prismaClient.task.findUnique = originalMethods.taskFindUnique;
  prismaClient.task.findUniqueOrThrow = originalMethods.taskFindUniqueOrThrow;
  prismaClient.task.update = originalMethods.taskUpdate;
  prismaClient.task.updateMany = originalMethods.taskUpdateMany;
  prismaClient.pointTransaction.create = originalMethods.pointTransactionCreate;
  prismaClient.dailyCheckin.findUnique = originalMethods.dailyCheckinFindUnique;
  prismaClient.dailyCheckin.upsert = originalMethods.dailyCheckinUpsert;
  prismaClient.dailyCheckin.update = originalMethods.dailyCheckinUpdate;
  prismaClient.$transaction = originalMethods.transaction;
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

function mockAwardPointDependencies() {
  prismaClient.pointTransaction.create = async ({ data }) => data;
  prismaClient.agent.update = async () => ({ id: "agent-1" });
  prismaClient.dailyCheckin.findUnique = async () => null;
  prismaClient.dailyCheckin.upsert = async () => ({
    id: "checkin-1",
    actions: {},
  });
  prismaClient.dailyCheckin.update = async () => ({ id: "checkin-1" });
}

test("complete sets completedAt when assignee submits work", async () => {
  let updateData: Record<string, unknown> | undefined;
  const now = new Date();

  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      assigneeId: "assignee-1",
      status: "CLAIMED",
    });

  const taskFixture = createTaskFixture({
    id: "task-1",
    creatorId: "creator-1",
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completedAt: now,
    creator: createAgentFixture({
      id: "creator-1",
      apiKey: "creator-key",
      name: "Creator",
    }),
    assignee: createAgentFixture({
      id: "assignee-1",
      apiKey: "assignee-key",
      name: "Assignee",
    }),
  });

  prismaClient.task.updateMany = async ({ data }) => {
    updateData = data as Record<string, unknown>;
    return { count: 1 };
  };
  prismaClient.task.findUniqueOrThrow = async () => taskFixture;
  prismaClient.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => {
    return callback(prismaClient);
  };

  const response = await completeTask(
    createRouteRequest("http://localhost/api/tasks/task-1/complete", {
      method: "POST",
      apiKey: "assignee-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "COMPLETED");
  assert.ok(updateData?.completedAt instanceof Date);
  assert.ok(json.data.completedAt);
});

test("verify rejection returns task to CLAIMED and clears completedAt", async () => {
  let updateData: Record<string, unknown> | undefined;

  mockAgentCredential("creator-key", {
    id: "creator-1",
    name: "Creator",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      status: "COMPLETED",
    });
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      throw new Error("Expected transaction callback");
    }

    return input({
      task: {
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          updateData = data;
          return { count: 1 };
        },
        findUniqueOrThrow: async () =>
          createTaskFixture({
            id: "task-1",
            creatorId: "creator-1",
            assigneeId: "assignee-1",
            status: "CLAIMED",
            completedAt: null,
            creator: createAgentFixture({
              id: "creator-1",
              apiKey: "creator-key",
              name: "Creator",
            }),
            assignee: createAgentFixture({
              id: "assignee-1",
              apiKey: "assignee-key",
              name: "Assignee",
            }),
          }),
      },
    });
  };

  const response = await verifyTask(
    createRouteRequest("http://localhost/api/tasks/task-1/verify", {
      method: "POST",
      apiKey: "creator-key",
      json: {
        approved: false,
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "CLAIMED");
  assert.equal(updateData?.completedAt, null);
  assert.equal(json.data.completedAt, null);
});

test("verify approval updates status and payouts inside one transaction", async () => {
  let transactionCalls = 0;
  const pointTransactions: Array<Record<string, unknown>> = [];

  mockAgentCredential("creator-key", {
    id: "creator-1",
    name: "Creator",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      bountyPoints: 25,
      status: "COMPLETED",
    });
  prismaClient.task.findUniqueOrThrow = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      bountyPoints: 25,
      status: "VERIFIED",
      completedAt: new Date().toISOString(),
      creator: createAgentFixture({
        id: "creator-1",
        apiKey: "creator-key",
        name: "Creator",
      }),
      assignee: createAgentFixture({
        id: "assignee-1",
        apiKey: "assignee-key",
        name: "Assignee",
      }),
    });
  mockAwardPointDependencies();
  prismaClient.$transaction = async (input) => {
    transactionCalls += 1;

    if (typeof input === "function") {
      return input({
        pointTransaction: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            pointTransactions.push(data);
            return data;
          },
        },
        agent: {
          update: async () => ({ id: "assignee-1" }),
        },
        task: {
          updateMany: async () => ({ count: 1 }),
          findUniqueOrThrow: prismaClient.task.findUniqueOrThrow,
        },
      });
    }

    if (Array.isArray(input)) {
      return Promise.all(input);
    }

    return input;
  };

  const response = await verifyTask(
    createRouteRequest("http://localhost/api/tasks/task-1/verify", {
      method: "POST",
      apiKey: "creator-key",
      json: {
        approved: true,
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "VERIFIED");
  assert.equal(transactionCalls, 1);
  assert.equal(pointTransactions.length, 2);
});
