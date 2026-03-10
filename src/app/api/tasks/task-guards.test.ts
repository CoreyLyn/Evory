import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createAgentFixture, createTaskFixture } from "@/test/factories";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { POST as claimTask } from "./[id]/claim/route";
import { POST as verifyTask } from "./[id]/verify/route";
import { POST as createTask } from "./route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type GuardPrismaMock = {
  agent: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
    updateMany: AsyncMethod;
  };
  task: {
    findUnique: AsyncMethod;
    findUniqueOrThrow: AsyncMethod;
    create: AsyncMethod;
    updateMany: AsyncMethod;
    delete: AsyncMethod;
  };
  pointTransaction: {
    create: AsyncMethod;
  };
  $transaction: (input: unknown) => Promise<unknown>;
};

const prismaClient = prisma as unknown as GuardPrismaMock;

const originalMethods = {
  agentFindUnique: prismaClient.agent.findUnique,
  agentUpdate: prismaClient.agent.update,
  agentUpdateMany: prismaClient.agent.updateMany,
  taskFindUnique: prismaClient.task.findUnique,
  taskFindUniqueOrThrow: prismaClient.task.findUniqueOrThrow,
  taskCreate: prismaClient.task.create,
  taskUpdateMany: prismaClient.task.updateMany,
  taskDelete: prismaClient.task.delete,
  pointTransactionCreate: prismaClient.pointTransaction.create,
  transaction: prismaClient.$transaction,
};

afterEach(() => {
  prismaClient.agent.findUnique = originalMethods.agentFindUnique;
  prismaClient.agent.update = originalMethods.agentUpdate;
  prismaClient.agent.updateMany = originalMethods.agentUpdateMany;
  prismaClient.task.findUnique = originalMethods.taskFindUnique;
  prismaClient.task.findUniqueOrThrow = originalMethods.taskFindUniqueOrThrow;
  prismaClient.task.create = originalMethods.taskCreate;
  prismaClient.task.updateMany = originalMethods.taskUpdateMany;
  prismaClient.task.delete = originalMethods.taskDelete;
  prismaClient.pointTransaction.create = originalMethods.pointTransactionCreate;
  prismaClient.$transaction = originalMethods.transaction;
});

test("claim returns conflict when the conditional status transition loses the race", async () => {
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
        updateMany: async () => ({ count: 0 }),
        findUniqueOrThrow: async () =>
          createTaskFixture({
            id: "task-1",
            creatorId: "creator-1",
            assigneeId: "claimer-1",
            status: "CLAIMED",
          }),
      },
    });
  };

  const response = await claimTask(
    createRouteRequest("http://localhost/api/tasks/task-1/claim", {
      method: "POST",
      apiKey: "claimer-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.error, "Task is no longer open for claiming");
});

test("verify approval stops without payouts when the conditional transition loses the race", async () => {
  let pointTransactionCreates = 0;

  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "creator-1",
      apiKey: "creator-key",
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
  prismaClient.pointTransaction.create = async () => {
    pointTransactionCreates += 1;
    return { id: `txn-${pointTransactionCreates}` };
  };
  prismaClient.agent.update = async () => ({ id: "assignee-1" });
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      throw new Error("Expected transaction callback");
    }

    return input({
      pointTransaction: {
        create: prismaClient.pointTransaction.create,
      },
      agent: {
        update: prismaClient.agent.update,
      },
      task: {
        updateMany: async () => ({ count: 0 }),
        findUniqueOrThrow: async () =>
          createTaskFixture({
            id: "task-1",
            creatorId: "creator-1",
            assigneeId: "assignee-1",
            bountyPoints: 25,
            status: "VERIFIED",
          }),
      },
    });
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

  assert.equal(response.status, 409);
  assert.equal(json.error, "Task is no longer awaiting verification");
  assert.equal(pointTransactionCreates, 0);
});

test("task creation aborts before creating a task when the balance guard fails at commit time", async () => {
  let agentLookups = 0;
  let taskCreateCalls = 0;

  prismaClient.agent.findUnique = async () => {
    agentLookups += 1;

    if (agentLookups === 1) {
      return createAgentFixture({
        id: "creator-1",
        apiKey: "creator-key",
        name: "Creator",
        points: 100,
      });
    }

    return { points: 100 };
  };
  prismaClient.task.create = async () => {
    taskCreateCalls += 1;
    return {
      id: "task-1",
      title: "Race-safe task",
    };
  };
  prismaClient.task.delete = async () => ({ id: "task-1" });
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      return input;
    }

    return input({
      agent: {
        updateMany: async () => ({ count: 0 }),
      },
      pointTransaction: {
        create: async () => ({ id: "txn-1" }),
      },
      task: {
        create: prismaClient.task.create,
        findUniqueOrThrow: async () =>
          createTaskFixture({
            id: "task-1",
            creatorId: "creator-1",
            assigneeId: null,
            status: "OPEN",
            bountyPoints: 100,
          }),
      },
    });
  };

  const response = await createTask(
    createRouteRequest("http://localhost/api/tasks", {
      method: "POST",
      apiKey: "creator-key",
      json: {
        title: "Race-safe task",
        description: "Should only exist when funds are reserved.",
        bountyPoints: 100,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.error, "Insufficient points for bounty");
  assert.equal(taskCreateCalls, 0);
});

test("task creation rejects unclaimed agents before business logic runs", async () => {
  let taskCreateCalls = 0;

  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "creator-1",
      apiKey: "creator-key",
      name: "Creator",
      ownerUserId: null,
      claimStatus: "UNCLAIMED",
      claimedAt: null,
    });
  prismaClient.task.create = async () => {
    taskCreateCalls += 1;
    return {
      id: "task-1",
      title: "Should not be created",
    };
  };

  const response = await createTask(
    createRouteRequest("http://localhost/api/tasks", {
      method: "POST",
      apiKey: "creator-key",
      json: {
        title: "Should not be created",
        description: "Guard first",
        bountyPoints: 10,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.error, "Unauthorized: Invalid or missing API key");
  assert.equal(taskCreateCalls, 0);
});
