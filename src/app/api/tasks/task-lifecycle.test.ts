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
import { POST as cancelTask } from "./[id]/cancel/route";
import { POST as completeTask } from "./[id]/complete/route";
import { POST as verifyTask } from "./[id]/verify/route";
import { POST as createTask } from "./route";

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
  agentActivityCreate: prismaClient.agentActivity?.create,
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
  prismaClient.dailyCheckin.findUnique = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
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
  if (prismaClient.agentActivity && originalMethods.agentActivityCreate) {
    prismaClient.agentActivity.create = originalMethods.agentActivityCreate;
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
  prismaClient.dailyCheckin.findUnique = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
  prismaClient.dailyCheckin.upsert = async () => ({
    id: "checkin-1",
    actions: {},
  });
  prismaClient.dailyCheckin.update = async () => ({ id: "checkin-1" });
}

test("complete sets completedAt and clears stale review feedback when assignee submits work", async () => {
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
      reviewComment: "Please tighten the implementation details.",
      reviewedAt: "2026-03-22T08:00:00.000Z",
    });

  const taskFixture = createTaskFixture({
    id: "task-1",
    creatorId: "creator-1",
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completedAt: now,
    reviewComment: null,
    reviewedAt: null,
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
  assert.equal(updateData?.reviewComment, null);
  assert.equal(updateData?.reviewedAt, null);
  assert.ok(json.data.completedAt);
  assert.equal(json.data.reviewComment, null);
  assert.equal(json.data.reviewedAt, null);
});

test("complete accepts optional completionNote and stores it", async () => {
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
    completionNote: "### Summary\n- Implemented feature X\n- Added tests",
    reviewComment: null,
    reviewedAt: null,
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
      json: {
        completionNote: "### Summary\n- Implemented feature X\n- Added tests",
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "COMPLETED");
  assert.equal(
    updateData?.completionNote,
    "### Summary\n- Implemented feature X\n- Added tests"
  );
  assert.equal(
    json.data.completionNote,
    "### Summary\n- Implemented feature X\n- Added tests"
  );
});

test("complete succeeds without completionNote field", async () => {
  let updateData: Record<string, unknown> | undefined;

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
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completionNote: null,
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
  assert.equal(updateData?.completionNote, null);
  assert.equal(json.data.completionNote, null);
});

test("complete stores empty string completionNote as null", async () => {
  let updateData: Record<string, unknown> | undefined;

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
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completionNote: null,
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
      json: { completionNote: "" },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(updateData?.completionNote, null);
  assert.equal(json.data.completionNote, null);
});

test("complete stores whitespace-only completionNote as null", async () => {
  let updateData: Record<string, unknown> | undefined;

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
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completionNote: null,
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
      json: { completionNote: "   " },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(updateData?.completionNote, null);
  assert.equal(json.data.completionNote, null);
});

test("complete succeeds when JSON body parse fails", async () => {
  let updateData: Record<string, unknown> | undefined;

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
    assigneeId: "assignee-1",
    status: "COMPLETED",
    completionNote: null,
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
      body: "invalid json{",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(updateData?.completionNote, null);
});

test("complete rejects completionNote over 5000 characters", async () => {
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

  const longNote = "x".repeat(5001);

  const response = await completeTask(
    createRouteRequest("http://localhost/api/tasks/task-1/complete", {
      method: "POST",
      apiKey: "assignee-key",
      json: { completionNote: longNote },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.ok(json.error.includes("5000"));
});

test("complete rejects non-string completionNote", async () => {
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

  const response = await completeTask(
    createRouteRequest("http://localhost/api/tasks/task-1/complete", {
      method: "POST",
      apiKey: "assignee-key",
      json: { completionNote: { invalid: "object" } },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.ok(json.error.includes("string"));
});

test("creator cancellation refunds bounty, records activity, and publishes task.cancelled", async () => {
  const activityCreates: Array<Record<string, unknown>> = [];
  const pointTransactions: Array<Record<string, unknown>> = [];
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
    if (event.type !== "task.cancelled") return;

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
    mockAgentCredential("creator-key", {
      id: "creator-1",
      name: "Creator",
    });
    prismaClient.task.findUnique = async () =>
      createTaskFixture({
        id: "task-1",
        creatorId: "creator-1",
        assigneeId: null,
        title: "Refundable task",
        bountyPoints: 25,
        status: "OPEN",
        assignee: null,
      });
    prismaClient.$transaction = async (input) => {
      if (typeof input !== "function") {
        throw new Error("Expected transaction callback");
      }

      return input({
        pointTransaction: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            pointTransactions.push(data);
            return data;
          },
        },
        agent: {
          update: async () => ({ id: "creator-1" }),
        },
        agentActivity: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            activityCreates.push(data);
            return { id: `activity-${activityCreates.length}` };
          },
        },
        task: {
          updateMany: async () => ({ count: 1 }),
          findUniqueOrThrow: async () =>
            createTaskFixture({
              id: "task-1",
              creatorId: "creator-1",
              assigneeId: null,
              title: "Refundable task",
              bountyPoints: 25,
              status: "CANCELLED",
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

    const response = await cancelTask(
      createRouteRequest("http://localhost/api/tasks/task-1/cancel", {
        method: "POST",
        apiKey: "creator-key",
      }),
      createRouteParams({ id: "task-1" })
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.data.status, "CANCELLED");
    assert.equal(pointTransactions.length, 1);
    assert.deepEqual(
      (({
        agentId,
        amount,
        type,
        referenceId,
      }: Record<string, unknown>) => ({
        agentId,
        amount,
        type,
        referenceId,
      }))(pointTransactions[0]),
      {
        agentId: "creator-1",
        amount: 25,
        type: "TASK_BOUNTY_REFUND",
        referenceId: "task-1",
      }
    );
    assert.deepEqual(
      activityCreates.filter((activity) => activity.type === "TASK_CANCELLED"),
      [
        {
          agentId: "creator-1",
          type: "TASK_CANCELLED",
          summary: "activity.task.cancelled",
          metadata: { taskId: "task-1", taskTitle: "Refundable task" },
        },
      ]
    );

    assert.deepEqual(publishedEvents, [
      {
        type: "task.cancelled",
        payload: {
          previousStatus: "OPEN",
          task: {
            id: "task-1",
            title: "Refundable task",
            status: "CANCELLED",
            creatorId: "creator-1",
            assigneeId: null,
            bountyPoints: 25,
            completedAt: null,
          },
        },
      },
    ]);
  } finally {
    unsubscribe();
  }
});

test("creator can cancel a claimed zero-bounty task without a refund transaction", async () => {
  const pointTransactions: Array<Record<string, unknown>> = [];
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
    if (event.type !== "task.cancelled") return;

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
    mockAgentCredential("creator-key", {
      id: "creator-1",
      name: "Creator",
    });
    prismaClient.task.findUnique = async () =>
      createTaskFixture({
        id: "task-2",
        creatorId: "creator-1",
        assigneeId: "assignee-1",
        title: "Zero bounty task",
        bountyPoints: 0,
        status: "CLAIMED",
      });
    prismaClient.$transaction = async (input) => {
      if (typeof input !== "function") {
        throw new Error("Expected transaction callback");
      }

      return input({
        pointTransaction: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            pointTransactions.push(data);
            return data;
          },
        },
        agent: {
          update: async () => ({ id: "creator-1" }),
        },
        agentActivity: {
          create: async () => ({ id: "activity-1" }),
        },
        task: {
          updateMany: async () => ({ count: 1 }),
          findUniqueOrThrow: async () =>
            createTaskFixture({
              id: "task-2",
              creatorId: "creator-1",
              assigneeId: "assignee-1",
              title: "Zero bounty task",
              bountyPoints: 0,
              status: "CANCELLED",
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

    const response = await cancelTask(
      createRouteRequest("http://localhost/api/tasks/task-2/cancel", {
        method: "POST",
        apiKey: "creator-key",
      }),
      createRouteParams({ id: "task-2" })
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.data.status, "CANCELLED");
    assert.equal(pointTransactions.length, 0);
    assert.deepEqual(publishedEvents, [
      {
        type: "task.cancelled",
        payload: {
          previousStatus: "CLAIMED",
          task: {
            id: "task-2",
            title: "Zero bounty task",
            status: "CANCELLED",
            creatorId: "creator-1",
            assigneeId: "assignee-1",
            bountyPoints: 0,
            completedAt: null,
          },
        },
      },
    ]);
  } finally {
    unsubscribe();
  }
});

test("creator cancellation clears stale review feedback from a previously rejected task", async () => {
  let updateData: Record<string, unknown> | undefined;

  mockAgentCredential("creator-key", {
    id: "creator-1",
    name: "Creator",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-rejected",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      title: "Rejected task",
      bountyPoints: 0,
      status: "CLAIMED",
      reviewComment: "Needs another pass",
      reviewedAt: "2026-03-23T08:30:00.000Z",
    });
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      throw new Error("Expected transaction callback");
    }

    return input({
      agentActivity: {
        create: async () => ({ id: "activity-1" }),
      },
      task: {
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          updateData = data;
          return { count: 1 };
        },
        findUniqueOrThrow: async () =>
          createTaskFixture({
            id: "task-rejected",
            creatorId: "creator-1",
            assigneeId: "assignee-1",
            title: "Rejected task",
            bountyPoints: 0,
            status: "CANCELLED",
            completedAt: null,
            reviewComment: null,
            reviewedAt: null,
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

  const response = await cancelTask(
    createRouteRequest("http://localhost/api/tasks/task-rejected/cancel", {
      method: "POST",
      apiKey: "creator-key",
    }),
    createRouteParams({ id: "task-rejected" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "CANCELLED");
  assert.equal(updateData?.reviewComment, null);
  assert.equal(updateData?.reviewedAt, null);
  assert.equal(json.data.reviewComment, null);
  assert.equal(json.data.reviewedAt, null);
});

test("cancel fails when TASK_CANCELLED activity write fails inside the transaction", async () => {
  let transactionSawActivityWrite = false;
  const pointTransactions: Array<Record<string, unknown>> = [];
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
    if (event.type !== "task.cancelled") return;
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
    mockAgentCredential("creator-key", {
      id: "creator-1",
      name: "Creator",
    });
    prismaClient.task.findUnique = async () =>
      createTaskFixture({
        id: "task-rollback",
        creatorId: "creator-1",
        assigneeId: "assignee-1",
        title: "Rollback task",
        bountyPoints: 25,
        status: "CLAIMED",
      });
    prismaClient.$transaction = async (input) => {
      if (typeof input !== "function") {
        throw new Error("Expected transaction callback");
      }

      return input({
        pointTransaction: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            pointTransactions.push(data);
            return data;
          },
        },
        agent: {
          update: async () => ({ id: "creator-1" }),
        },
        task: {
          updateMany: async () => ({ count: 1 }),
          findUniqueOrThrow: async () =>
            createTaskFixture({
              id: "task-rollback",
              creatorId: "creator-1",
              assigneeId: "assignee-1",
              title: "Rollback task",
              bountyPoints: 25,
              status: "CANCELLED",
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
        agentActivity: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            if (data.type === "TASK_CANCELLED") {
              transactionSawActivityWrite = true;
              throw new Error("transaction activity write failed");
            }

            return { id: "activity-1" };
          },
        },
      });
    };

    const response = await cancelTask(
      createRouteRequest("http://localhost/api/tasks/task-rollback/cancel", {
        method: "POST",
        apiKey: "creator-key",
      }),
      createRouteParams({ id: "task-rollback" })
    );
    const json = await response.json();

    assert.equal(response.status, 500);
    assert.equal(json.success, false);
    assert.equal(json.error, "Internal server error");
    assert.equal(transactionSawActivityWrite, true);
    assert.equal(pointTransactions.length, 1);
    assert.deepEqual(
      (({
        agentId,
        amount,
        type,
        referenceId,
      }: Record<string, unknown>) => ({
        agentId,
        amount,
        type,
        referenceId,
      }))(pointTransactions[0]),
      {
        agentId: "creator-1",
        amount: 25,
        type: "TASK_BOUNTY_REFUND",
        referenceId: "task-rollback",
      }
    );
    assert.deepEqual(publishedEvents, []);
  } finally {
    unsubscribe();
  }
});

test("task creation records TASK_CREATED activity for the creator", async () => {
  const activityCreates: Array<Record<string, unknown>> = [];

  mockAgentCredential("creator-key", {
    id: "creator-1",
    name: "Creator",
    points: 100,
  });
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      return input;
    }

    return input({
      agentActivity: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          activityCreates.push(data);
          return { id: "activity-1" };
        },
      },
      task: {
        create: async () =>
          createTaskFixture({
            id: "task-1",
            creatorId: "creator-1",
            assigneeId: null,
            title: "Race-safe task",
            description: "Should only exist when funds are reserved.",
            status: "OPEN",
            bountyPoints: 0,
          }),
        findUniqueOrThrow: async () =>
          createTaskFixture({
            id: "task-1",
            creatorId: "creator-1",
            assigneeId: null,
            title: "Race-safe task",
            description: "Should only exist when funds are reserved.",
            status: "OPEN",
            bountyPoints: 0,
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
        bountyPoints: 0,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.id, "task-1");
  assert.deepEqual(activityCreates, [
    {
      agentId: "creator-1",
      type: "TASK_CREATED",
      summary: "activity.task.created",
      metadata: { taskId: "task-1", taskTitle: "Race-safe task" },
    },
  ]);
});

test("task creation fails when TASK_CREATED activity write fails inside the transaction", async () => {
  let transactionSawActivityWrite = false;

  mockAgentCredential("creator-key", {
    id: "creator-1",
    name: "Creator",
    points: 100,
  });
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      return input;
    }

    return input({
      agentActivity: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (data.type === "TASK_CREATED") {
            transactionSawActivityWrite = true;
            throw new Error("transaction activity write failed");
          }

          return { id: "activity-1" };
        },
      },
      task: {
        create: async () =>
          createTaskFixture({
            id: "task-1",
            creatorId: "creator-1",
            assigneeId: null,
            title: "Race-safe task",
            description: "Should only exist when funds are reserved.",
            status: "OPEN",
            bountyPoints: 0,
          }),
        findUniqueOrThrow: async () =>
          createTaskFixture({
            id: "task-1",
            creatorId: "creator-1",
            assigneeId: null,
            title: "Race-safe task",
            description: "Should only exist when funds are reserved.",
            status: "OPEN",
            bountyPoints: 0,
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
        bountyPoints: 0,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 500);
  assert.equal(json.success, false);
  assert.equal(json.error, "Internal server error");
  assert.equal(transactionSawActivityWrite, true);
});

test("verify rejection returns task to CLAIMED and clears completedAt", async () => {
  const activityCreates: Array<Record<string, unknown>> = [];
  let updateData: Record<string, unknown> | undefined;
  const reviewedAt = "2026-03-23T08:30:00.000Z";

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
      agentActivity: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          activityCreates.push(data);
          return { id: "activity-1" };
        },
      },
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
            reviewComment: "Needs another pass",
            reviewedAt,
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
        reviewComment: "  Needs another pass  ",
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "CLAIMED");
  assert.equal(updateData?.completedAt, null);
  assert.equal(updateData?.reviewComment, "Needs another pass");
  assert.ok(updateData?.reviewedAt instanceof Date);
  assert.equal(json.data.completedAt, null);
  assert.equal(json.data.reviewComment, "Needs another pass");
  assert.equal(json.data.reviewedAt, reviewedAt);
  assert.deepEqual(activityCreates, [
    {
      agentId: "creator-1",
      type: "TASK_REJECTED",
      summary: "activity.task.rejected",
      metadata: { taskId: "task-1", taskTitle: "Task title" },
    },
  ]);
});

test("verify rejection clears stale completionNote from previously completed task", async () => {
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
      completionNote: "Old work summary",
    });
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      throw new Error("Expected transaction callback");
    }

    return input({
      agentActivity: {
        create: async () => ({ id: "activity-1" }),
      },
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
            completionNote: null,
            reviewComment: "Needs another pass",
            reviewedAt: "2026-03-23T08:30:00.000Z",
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
        reviewComment: "Needs another pass",
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "CLAIMED");
  assert.equal(updateData?.completionNote, null);
  assert.equal(json.data.completionNote, null);
});

test("verify rejection fails when TASK_REJECTED activity write fails inside the transaction", async () => {
  let transactionSawActivityWrite = false;

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
        updateMany: async () => ({ count: 1 }),
        findUniqueOrThrow: async () =>
          createTaskFixture({
            id: "task-1",
            creatorId: "creator-1",
            assigneeId: "assignee-1",
            status: "CLAIMED",
            completedAt: null,
            reviewComment: "Needs another pass",
            reviewedAt: "2026-03-23T08:30:00.000Z",
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
      agentActivity: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (data.type === "TASK_REJECTED") {
            transactionSawActivityWrite = true;
            throw new Error("transaction activity write failed");
          }

          return { id: "activity-1" };
        },
      },
    });
  };

  const response = await verifyTask(
    createRouteRequest("http://localhost/api/tasks/task-1/verify", {
      method: "POST",
      apiKey: "creator-key",
      json: {
        approved: false,
        reviewComment: "Needs another pass",
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 500);
  assert.equal(json.success, false);
  assert.equal(json.error, "Internal server error");
  assert.equal(transactionSawActivityWrite, true);
});

test("verify approval updates status and payouts inside one transaction", async () => {
  const activityCreates: Array<Record<string, unknown>> = [];
  let transactionCalls = 0;
  const pointTransactions: Array<Record<string, unknown>> = [];
  let updateData: Record<string, unknown> | undefined;
  const reviewedAt = "2026-03-23T09:00:00.000Z";

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
      reviewComment: "Looks good",
      reviewedAt,
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
  prismaClient.agentActivity = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      activityCreates.push(data);
      return { id: "activity-1" };
    },
  };
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
        agentActivity: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            activityCreates.push(data);
            return {};
          },
        },
        dailyCheckin: {
          upsert: prismaClient.dailyCheckin.upsert,
          update: prismaClient.dailyCheckin.update,
        },
        task: {
          updateMany: async ({ data }: { data: Record<string, unknown> }) => {
            updateData = data;
            return { count: 1 };
          },
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
        reviewComment: "  Looks good  ",
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "VERIFIED");
  assert.equal(updateData?.reviewComment, "Looks good");
  assert.ok(updateData?.reviewedAt instanceof Date);
  assert.equal(json.data.reviewComment, "Looks good");
  assert.equal(json.data.reviewedAt, reviewedAt);
  assert.equal(transactionCalls, 1);
  assert.equal(pointTransactions.length, 2);
  assert.deepEqual(
    activityCreates.filter((activity) => activity.type === "TASK_VERIFIED"),
    [
      {
        agentId: "creator-1",
        type: "TASK_VERIFIED",
        summary: "activity.task.verified",
        metadata: { taskId: "task-1", taskTitle: "Task title" },
      },
    ]
  );
  assert.equal(
    activityCreates.filter((activity) => activity.type === "POINT_EARNED").length,
    2
  );
});

test("verify approval fails when TASK_VERIFIED activity write fails inside the transaction", async () => {
  let transactionCalls = 0;
  let transactionSawTaskVerifiedWrite = false;

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
      reviewComment: "Looks good",
      reviewedAt: "2026-03-23T09:00:00.000Z",
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

    if (typeof input !== "function") {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }

      return input;
    }

    return input({
      pointTransaction: {
        create: async ({ data }: { data: Record<string, unknown> }) => data,
      },
      agent: {
        update: async () => ({ id: "assignee-1" }),
      },
      agentActivity: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (data.type === "TASK_VERIFIED") {
            transactionSawTaskVerifiedWrite = true;
            throw new Error("transaction activity write failed");
          }

          return { id: "activity-1" };
        },
      },
      dailyCheckin: {
        upsert: prismaClient.dailyCheckin.upsert,
        update: prismaClient.dailyCheckin.update,
      },
      task: {
        updateMany: async () => ({ count: 1 }),
        findUniqueOrThrow: prismaClient.task.findUniqueOrThrow,
      },
    });
  };

  const response = await verifyTask(
    createRouteRequest("http://localhost/api/tasks/task-1/verify", {
      method: "POST",
      apiKey: "creator-key",
      json: {
        approved: true,
        reviewComment: "Looks good",
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 500);
  assert.equal(json.success, false);
  assert.equal(json.error, "Internal server error");
  assert.equal(transactionCalls, 1);
  assert.equal(transactionSawTaskVerifiedWrite, true);
});

test("verify approval skips COMPLETE_TASK points when the daily limit is already reached", async () => {
  const pointTransactions: Array<Record<string, unknown>> = [];
  const prismaClientWithConfig = prisma as Record<string, unknown>;
  const originalPointConfig = prismaClientWithConfig.pointConfig;

  try {
    prismaClientWithConfig.pointConfig = {
      findMany: async () => [
        {
          action: "COMPLETE_TASK",
          points: 5,
          dailyLimit: 1,
        },
      ],
    };

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
        reviewComment: "Looks good",
        reviewedAt: "2026-03-23T09:00:00.000Z",
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
    prismaClient.dailyCheckin.findUnique = async () => ({
      id: "checkin-1",
      actions: {
        DAILY_LOGIN: true,
        COMPLETE_TASK: 1,
      },
    });
    prismaClient.dailyCheckin.upsert = async () => ({
      id: "checkin-1",
      actions: {
        COMPLETE_TASK: 1, // 已达限额
      },
    });
    prismaClient.dailyCheckin.update = async () => ({ id: "checkin-1" });
    prismaClient.$transaction = async (input) => {
      if (typeof input !== "function") {
        if (Array.isArray(input)) {
          return Promise.all(input);
        }

        return input;
      }

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
        agentActivity: {
          create: async () => ({ id: "activity-1" }),
        },
        dailyCheckin: {
          upsert: prismaClient.dailyCheckin.upsert,
          update: prismaClient.dailyCheckin.update,
        },
        task: {
          updateMany: async () => ({ count: 1 }),
          findUniqueOrThrow: prismaClient.task.findUniqueOrThrow,
        },
      });
    };

    const response = await verifyTask(
      createRouteRequest("http://localhost/api/tasks/task-1/verify", {
        method: "POST",
        apiKey: "creator-key",
        json: {
          approved: true,
          reviewComment: "Looks good",
        },
      }),
      createRouteParams({ id: "task-1" })
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.success, true);
    assert.equal(pointTransactions.length, 1);
    assert.equal(pointTransactions[0]?.type, "TASK_BOUNTY_EARN");
  } finally {
    prismaClientWithConfig.pointConfig = originalPointConfig;
  }
});
