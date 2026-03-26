import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { hashApiKey } from "@/lib/auth";
import { subscribeToLiveEvents } from "@/lib/live-events";
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
import { POST as abandonTask } from "./route";

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
  agentActivity?: {
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
  dailyCheckin: {
    findUnique: AsyncMethod;
    upsert: AsyncMethod;
    update: AsyncMethod;
  };
  pointTransaction: {
    create: AsyncMethod;
  };
  $transaction: (input: unknown) => Promise<unknown>;
};

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

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
  agentActivityCreate: prismaClient.agentActivity?.create,
  transaction: prismaClient.$transaction,
  dailyCheckinFindUnique: prismaClient.dailyCheckin.findUnique,
  dailyCheckinUpsert: prismaClient.dailyCheckin.upsert,
  dailyCheckinUpdate: prismaClient.dailyCheckin.update,
  pointTransactionCreate: prismaClient.pointTransaction.create,
};

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
  };
  prismaClient.agentActivity = {
    create: async () => ({ id: "activity-1" }),
  };
  prismaClient.dailyCheckin.findUnique = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
  prismaClient.dailyCheckin.upsert = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
  prismaClient.dailyCheckin.update = async ({ data }: { data: Record<string, unknown> }) => ({
    id: "checkin-1",
    actions: data.actions,
  });
  prismaClient.pointTransaction.create = async ({ data }: { data: Record<string, unknown> }) => data;
  prismaClient.$transaction = async (input: unknown) => {
    if (typeof input !== "function") {
      return input;
    }
    return input({
      pointTransaction: {
        create: prismaClient.pointTransaction.create,
      },
      agent: {
        update: prismaClient.agent.update,
      },
      dailyCheckin: {
        upsert: prismaClient.dailyCheckin.upsert,
        update: prismaClient.dailyCheckin.update,
      },
      agentActivity: {
        create: prismaClient.agentActivity?.create,
      },
    });
  };
});

afterEach(async () => {
  await resetRateLimitStore();
  prismaClient.agent.findUnique = originalMethods.agentFindUnique;
  prismaClient.agent.update = originalMethods.agentUpdate;
  prismaClient.agent.updateMany = originalMethods.agentUpdateMany;
  if (prismaClient.agentCredential && originalMethods.credentialFindUnique) {
    prismaClient.agentCredential.findUnique = originalMethods.credentialFindUnique;
  }
  if (prismaClient.agentCredential && originalMethods.credentialUpdate) {
    prismaClient.agentCredential.update = originalMethods.credentialUpdate;
  }
  if (prismaClient.securityEvent && originalMethods.securityEventCreate) {
    prismaClient.securityEvent.create = originalMethods.securityEventCreate;
  }
  if (prismaClient.agentActivity && originalMethods.agentActivityCreate) {
    prismaClient.agentActivity.create = originalMethods.agentActivityCreate;
  }
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  prismaClient.task.findUnique = originalMethods.taskFindUnique;
  prismaClient.task.findUniqueOrThrow = originalMethods.taskFindUniqueOrThrow;
  prismaClient.task.update = originalMethods.taskUpdate;
  prismaClient.task.updateMany = originalMethods.taskUpdateMany;
  prismaClient.$transaction = originalMethods.transaction;
  prismaClient.dailyCheckin.findUnique = originalMethods.dailyCheckinFindUnique;
  prismaClient.dailyCheckin.upsert = originalMethods.dailyCheckinUpsert;
  prismaClient.dailyCheckin.update = originalMethods.dailyCheckinUpdate;
  prismaClient.pointTransaction.create = originalMethods.pointTransactionCreate;
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

test("assignee can abandon a completed task", async () => {
  const activityCreates: Array<Record<string, unknown>> = [];
  const publishedEvents: Array<{
    type: string;
    payload: {
      previousStatus: string | null;
      task: {
        id: string;
        title: string;
        status: string;
        creatorId: string;
        assigneeId: string | null;
        bountyPoints: number;
        completedAt: string | null;
      };
    };
  }> = [];
  const unsubscribe = subscribeToLiveEvents((event) => {
    if (event.type !== "task.abandoned") return;

    publishedEvents.push({
      type: event.type,
      payload: {
        previousStatus: event.payload.previousStatus,
        task: {
          id: event.payload.task.id,
          title: event.payload.task.title,
          status: event.payload.task.status,
          creatorId: event.payload.task.creatorId,
          assigneeId: event.payload.task.assigneeId,
          bountyPoints: event.payload.task.bountyPoints,
          completedAt: event.payload.task.completedAt,
        },
      },
    });
  });

  try {
    mockAgentCredential("assignee-key", {
      id: "assignee-1",
      name: "Assignee",
    });
    prismaClient.task.findUnique = async () =>
      createTaskFixture({
        id: "task-1",
        creatorId: "creator-1",
        assigneeId: "assignee-1",
        title: "Completed task",
        bountyPoints: 50,
        status: "COMPLETED",
        completedAt: new Date("2025-01-15T10:00:00Z"),
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
              assigneeId: null,
              title: "Completed task",
              bountyPoints: 50,
              status: "OPEN",
              completedAt: null,
              creator: createAgentFixture({
                id: "creator-1",
                apiKey: "creator-key",
                name: "Creator",
              }),
              assignee: null,
            }),
        },
      });
    };
    prismaClient.agentActivity = {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        activityCreates.push(data);
        return { id: `activity-${activityCreates.length}` };
      },
    };

    const response = await abandonTask(
      createRouteRequest("http://localhost/api/tasks/task-1/abandon", {
        method: "POST",
        apiKey: "assignee-key",
      }),
      createRouteParams({ id: "task-1" })
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.data.status, "OPEN");
    assert.equal(json.data.assigneeId, null);
    assert.deepEqual(activityCreates, [
      {
        agentId: "assignee-1",
        type: "TASK_ABANDONED",
        summary: "activity.task.abandoned",
        metadata: { taskId: "task-1", taskTitle: "Completed task" },
      },
    ]);
    assert.deepEqual(publishedEvents, [
      {
        type: "task.abandoned",
        payload: {
          previousStatus: "COMPLETED",
          task: {
            id: "task-1",
            title: "Completed task",
            status: "OPEN",
            creatorId: "creator-1",
            assigneeId: null,
            bountyPoints: 50,
            completedAt: null,
          },
        },
      },
    ]);
  } finally {
    unsubscribe();
  }
});

test("non-assignee cannot abandon task (403)", async () => {
  mockAgentCredential("other-key", {
    id: "other-1",
    name: "Other",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      status: "COMPLETED",
    });

  const response = await abandonTask(
    createRouteRequest("http://localhost/api/tasks/task-1/abandon", {
      method: "POST",
      apiKey: "other-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.error, "Only the assignee can abandon this task");
});

test("cannot abandon task not in COMPLETED status (400)", async () => {
  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      status: "OPEN",
    });

  const response = await abandonTask(
    createRouteRequest("http://localhost/api/tasks/task-1/abandon", {
      method: "POST",
      apiKey: "assignee-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Task is not in COMPLETED status");
});

test("abandon non-existent task returns 404", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    name: "Agent",
  });
  prismaClient.task.findUnique = async () => null;

  const response = await abandonTask(
    createRouteRequest("http://localhost/api/tasks/task-404/abandon", {
      method: "POST",
      apiKey: "agent-key",
    }),
    createRouteParams({ id: "task-404" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Task not found");
});

test("abandon handles concurrent modification (409)", async () => {
  mockAgentCredential("assignee-key", {
    id: "assignee-1",
    name: "Assignee",
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
        updateMany: async () => ({ count: 0 }), // Simulate race condition
        findUniqueOrThrow: async () => {
          throw new Error("Should not be called");
        },
      },
    });
  };

  const response = await abandonTask(
    createRouteRequest("http://localhost/api/tasks/task-1/abandon", {
      method: "POST",
      apiKey: "assignee-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.success, false);
  assert.equal(json.error, "Task is no longer in COMPLETED status");
});