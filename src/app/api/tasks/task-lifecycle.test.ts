import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { POST as completeTask } from "./[id]/complete/route";
import { POST as verifyTask } from "./[id]/verify/route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type TaskPrismaMock = {
  agent: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
  task: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
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
  taskFindUnique: prismaClient.task.findUnique,
  taskUpdate: prismaClient.task.update,
  pointTransactionCreate: prismaClient.pointTransaction.create,
  dailyCheckinFindUnique: prismaClient.dailyCheckin.findUnique,
  dailyCheckinUpsert: prismaClient.dailyCheckin.upsert,
  dailyCheckinUpdate: prismaClient.dailyCheckin.update,
  transaction: prismaClient.$transaction,
};

afterEach(() => {
  prismaClient.agent.findUnique = originalMethods.agentFindUnique;
  prismaClient.agent.update = originalMethods.agentUpdate;
  prismaClient.task.findUnique = originalMethods.taskFindUnique;
  prismaClient.task.update = originalMethods.taskUpdate;
  prismaClient.pointTransaction.create = originalMethods.pointTransactionCreate;
  prismaClient.dailyCheckin.findUnique = originalMethods.dailyCheckinFindUnique;
  prismaClient.dailyCheckin.upsert = originalMethods.dailyCheckinUpsert;
  prismaClient.dailyCheckin.update = originalMethods.dailyCheckinUpdate;
  prismaClient.$transaction = originalMethods.transaction;
});

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

  prismaClient.agent.findUnique = async () => ({
    id: "assignee-1",
    apiKey: "assignee-key",
  });
  prismaClient.task.findUnique = async () => ({
    id: "task-1",
    assigneeId: "assignee-1",
    status: "CLAIMED",
  });
  prismaClient.task.update = async ({ data }) => {
    updateData = data as Record<string, unknown>;
    return {
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      title: "Task title",
      description: "Task description",
      status: data.status,
      bountyPoints: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: data.completedAt,
      creator: { id: "creator-1", name: "Creator", avatarConfig: {} },
      assignee: { id: "assignee-1", name: "Assignee", avatarConfig: {} },
    };
  };

  const response = await completeTask(
    new NextRequest("http://localhost/api/tasks/task-1/complete", {
      method: "POST",
      headers: {
        Authorization: "Bearer assignee-key",
      },
    }),
    { params: Promise.resolve({ id: "task-1" }) }
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "COMPLETED");
  assert.ok(updateData?.completedAt instanceof Date);
  assert.ok(json.data.completedAt);
});

test("verify rejection returns task to CLAIMED and clears completedAt", async () => {
  let updateData: Record<string, unknown> | undefined;

  prismaClient.agent.findUnique = async () => ({
    id: "creator-1",
    apiKey: "creator-key",
  });
  prismaClient.task.findUnique = async () => ({
    id: "task-1",
    creatorId: "creator-1",
    assigneeId: "assignee-1",
    title: "Task title",
    bountyPoints: 10,
    status: "COMPLETED",
  });
  prismaClient.task.update = async ({ data }) => {
    updateData = data as Record<string, unknown>;
    return {
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      title: "Task title",
      description: "Task description",
      status: data.status,
      bountyPoints: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: data.completedAt ?? null,
      creator: { id: "creator-1", name: "Creator", avatarConfig: {} },
      assignee: { id: "assignee-1", name: "Assignee", avatarConfig: {} },
    };
  };

  const response = await verifyTask(
    new NextRequest("http://localhost/api/tasks/task-1/verify", {
      method: "POST",
      headers: {
        Authorization: "Bearer creator-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        approved: false,
      }),
    }),
    { params: Promise.resolve({ id: "task-1" }) }
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

  prismaClient.agent.findUnique = async () => ({
    id: "creator-1",
    apiKey: "creator-key",
  });
  prismaClient.task.findUnique = async () => ({
    id: "task-1",
    creatorId: "creator-1",
    assigneeId: "assignee-1",
    title: "Task title",
    bountyPoints: 25,
    status: "COMPLETED",
  });
  prismaClient.task.update = async () => ({
    id: "task-1",
    creatorId: "creator-1",
    assigneeId: "assignee-1",
    title: "Task title",
    description: "Task description",
    status: "VERIFIED",
    bountyPoints: 25,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    creator: { id: "creator-1", name: "Creator", avatarConfig: {} },
    assignee: { id: "assignee-1", name: "Assignee", avatarConfig: {} },
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
        dailyCheckin: {
          upsert: prismaClient.dailyCheckin.upsert,
          update: prismaClient.dailyCheckin.update,
        },
        task: {
          update: prismaClient.task.update,
        },
      });
    }

    if (Array.isArray(input)) {
      return Promise.all(input);
    }

    return input;
  };

  const response = await verifyTask(
    new NextRequest("http://localhost/api/tasks/task-1/verify", {
      method: "POST",
      headers: {
        Authorization: "Bearer creator-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        approved: true,
      }),
    }),
    { params: Promise.resolve({ id: "task-1" }) }
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "VERIFIED");
  assert.equal(transactionCalls, 1);
  assert.equal(pointTransactions.length, 2);
});
