import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { hashApiKey } from "@/lib/auth";
import { resetRateLimitStore } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createSecurityEventFixture,
  createTaskFixture,
} from "@/test/factories";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { POST as cancelTask } from "./[id]/cancel/route";
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
    create: AsyncMethod;
    updateMany: AsyncMethod;
    delete: AsyncMethod;
  };
  pointTransaction: {
    create: AsyncMethod;
  };
  dailyCheckin: {
    findUnique: AsyncMethod;
  };
  $transaction: (input: unknown) => Promise<unknown>;
};

const prismaClient = prisma as unknown as GuardPrismaMock;

const originalMethods = {
  agentFindUnique: prismaClient.agent.findUnique,
  agentUpdate: prismaClient.agent.update,
  agentUpdateMany: prismaClient.agent.updateMany,
  credentialFindUnique: prismaClient.agentCredential?.findUnique,
  credentialUpdate: prismaClient.agentCredential?.update,
  taskFindUnique: prismaClient.task.findUnique,
  taskFindUniqueOrThrow: prismaClient.task.findUniqueOrThrow,
  taskCreate: prismaClient.task.create,
  taskUpdateMany: prismaClient.task.updateMany,
  taskDelete: prismaClient.task.delete,
  pointTransactionCreate: prismaClient.pointTransaction.create,
  dailyCheckinFindUnique: prismaClient.dailyCheckin.findUnique,
  securityEventCreate: prismaClient.securityEvent?.create,
  rateLimitCounter: prismaClient.rateLimitCounter,
  transaction: prismaClient.$transaction,
};

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
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
  prismaClient.task.findUnique = originalMethods.taskFindUnique;
  prismaClient.task.findUniqueOrThrow = originalMethods.taskFindUniqueOrThrow;
  prismaClient.task.create = originalMethods.taskCreate;
  prismaClient.task.updateMany = originalMethods.taskUpdateMany;
  prismaClient.task.delete = originalMethods.taskDelete;
  prismaClient.pointTransaction.create = originalMethods.pointTransactionCreate;
  prismaClient.dailyCheckin.findUnique = originalMethods.dailyCheckinFindUnique;
  if (prismaClient.securityEvent && originalMethods.securityEventCreate) {
    prismaClient.securityEvent.create = originalMethods.securityEventCreate;
  }
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  prismaClient.$transaction = originalMethods.transaction;
});

function mockAgentCredential(
  apiKey: string,
  agentOverrides: Record<string, unknown> = {},
  credentialOverrides: Record<string, unknown> = {}
) {
  prismaClient.agent.update = async ({ where }: { where: { id: string } }) =>
    createAgentFixture({
      id: where.id,
      apiKey,
      ...agentOverrides,
    });
  prismaClient.agentCredential = {
    findUnique: async ({ where }: { where: { keyHash: string } }) =>
      where.keyHash === hashApiKey(apiKey)
        ? createAgentCredentialFixture({
            keyHash: where.keyHash,
            ...credentialOverrides,
            agent: createAgentFixture({
              apiKey,
              ...agentOverrides,
            }),
          })
        : null,
    update: async () => createAgentCredentialFixture(),
  };
}

test("claim returns conflict when the conditional status transition loses the race", async () => {
  mockAgentCredential("claimer-key", {
    id: "claimer-1",
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
  assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
  assert.equal(json.error, "Task is no longer open for claiming");
});

test("cancel returns forbidden when the requester is not the creator", async () => {
  let transactionCalls = 0;

  mockAgentCredential("non-creator-key", {
    id: "agent-2",
    name: "Non Creator",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      status: "OPEN",
    });
  prismaClient.$transaction = async (input) => {
    transactionCalls += 1;
    return input;
  };

  const response = await cancelTask(
    createRouteRequest("http://localhost/api/tasks/task-1/cancel", {
      method: "POST",
      apiKey: "non-creator-key",
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
  assert.equal(json.error, "Only the creator can cancel this task");
  assert.equal(transactionCalls, 0);
});

test("cancel rejects tasks that are not OPEN or CLAIMED", async () => {
  let transactionCalls = 0;

  mockAgentCredential("creator-key", {
    id: "creator-1",
    name: "Creator",
  });
  prismaClient.$transaction = async (input) => {
    transactionCalls += 1;
    return input;
  };

  for (const status of ["COMPLETED", "VERIFIED", "CANCELLED"] as const) {
    prismaClient.task.findUnique = async () =>
      createTaskFixture({
        id: `task-${status.toLowerCase()}`,
        creatorId: "creator-1",
        assigneeId: "assignee-1",
        status,
      });

    const response = await cancelTask(
      createRouteRequest(`http://localhost/api/tasks/task-${status.toLowerCase()}/cancel`, {
        method: "POST",
        apiKey: "creator-key",
      }),
      createRouteParams({ id: `task-${status.toLowerCase()}` })
    );
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
    assert.equal(json.error, "Task can only be cancelled when open or claimed");
  }

  assert.equal(transactionCalls, 0);
});

test("cancel returns conflict when the conditional transition loses the race", async () => {
  mockAgentCredential("creator-key", {
    id: "creator-1",
    name: "Creator",
  });
  prismaClient.task.findUnique = async () =>
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: "assignee-1",
      status: "CLAIMED",
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
            assigneeId: "assignee-1",
            status: "CANCELLED",
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

  assert.equal(response.status, 409);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
  assert.equal(json.error, "Task is no longer open or claimed");
});

test("verify approval stops without payouts when the conditional transition loses the race", async () => {
  let pointTransactionCreates = 0;

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
      agentActivity: {
        create: async () => ({}),
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
  assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
  assert.equal(json.error, "Task is no longer awaiting verification");
  assert.equal(pointTransactionCreates, 0);
});

test("verify rejection requires a non-empty review comment", async () => {
  let transactionCalls = 0;

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
    transactionCalls += 1;

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
        reviewComment: "   ",
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.error, "Review comment is required when rejecting a task");
  assert.equal(transactionCalls, 0);
});

test("verify rejects non-string review comments when provided", async () => {
  let transactionCalls = 0;

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
    transactionCalls += 1;

    if (typeof input !== "function") {
      throw new Error("Expected transaction callback");
    }

    return input({
      task: {
        updateMany: async () => ({ count: 1 }),
        findUniqueOrThrow: async () => createTaskFixture(),
      },
    });
  };

  const response = await verifyTask(
    createRouteRequest("http://localhost/api/tasks/task-1/verify", {
      method: "POST",
      apiKey: "creator-key",
      json: {
        approved: true,
        reviewComment: 123,
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.error, "reviewComment must be a string");
  assert.equal(transactionCalls, 0);
});

test("verify rejects oversized review comments", async () => {
  let transactionCalls = 0;
  const oversizedComment = "x".repeat(5001);

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
    transactionCalls += 1;

    if (typeof input !== "function") {
      throw new Error("Expected transaction callback");
    }

    return input({
      task: {
        updateMany: async () => ({ count: 1 }),
        findUniqueOrThrow: async () => createTaskFixture(),
      },
    });
  };

  const response = await verifyTask(
    createRouteRequest("http://localhost/api/tasks/task-1/verify", {
      method: "POST",
      apiKey: "creator-key",
      json: {
        approved: true,
        reviewComment: oversizedComment,
      },
    }),
    createRouteParams({ id: "task-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.error, "reviewComment must be at most 5000 characters");
  assert.equal(transactionCalls, 0);
});

test("task creation aborts when the balance guard fails at commit time", async () => {
  mockAgentCredential("creator-key", {
    id: "creator-1",
    name: "Creator",
    points: 100,
  });
  prismaClient.task.create = async () => ({
    id: "task-1",
    title: "Race-safe task",
  });
  prismaClient.task.delete = async () => ({ id: "task-1" });
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      return input;
    }

    return input({
      agent: {
        updateMany: async () => ({ count: 0 }),
      },
      agentActivity: {
        create: async () => ({}),
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
});

test("task creation rejects unclaimed agents before business logic runs", async () => {
  let taskCreateCalls = 0;

  mockAgentCredential("creator-key", {
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
  assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
  assert.equal(json.error, "Unauthorized: Invalid or missing API key");
  assert.equal(taskCreateCalls, 0);
});

test("task creation rejects credentials missing tasks:write scope", async () => {
  let taskCreateCalls = 0;

  mockAgentCredential(
    "creator-key",
    {
      id: "creator-1",
      name: "Creator",
      points: 100,
    },
    {
      scopes: ["tasks:read"],
    }
  );
  prismaClient.task.create = async () => {
    taskCreateCalls += 1;
    return { id: "task-1" };
  };
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      return input;
    }

    return input({
      agent: {
        updateMany: async () => ({ count: 1 }),
      },
      pointTransaction: {
        create: async () => ({ id: "txn-1" }),
      },
      task: {
        create: prismaClient.task.create,
        findUniqueOrThrow: async () => createTaskFixture(),
      },
    });
  };

  const response = await createTask(
    createRouteRequest("http://localhost/api/tasks", {
      method: "POST",
      apiKey: "creator-key",
      json: {
        title: "Scoped task",
        description: "Should not write",
        bountyPoints: 0,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.error, "Forbidden: Missing required scope tasks:write");
  assert.equal(taskCreateCalls, 0);
});

test("task creation rejects obviously garbled text before insertion", async () => {
  let taskCreateCalls = 0;

  mockAgentCredential("creator-key", {
    id: "creator-1",
    name: "Creator",
    points: 100,
  });
  prismaClient.task.create = async () => {
    taskCreateCalls += 1;
    return { id: "task-1" };
  };
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      return input;
    }

    return input({
      task: {
        create: prismaClient.task.create,
        findUniqueOrThrow: async () => createTaskFixture(),
      },
    });
  };

  const response = await createTask(
    createRouteRequest("http://localhost/api/tasks", {
      method: "POST",
      apiKey: "creator-key",
      json: {
        title: "Task ��????",
        description: "��nu�ќ��л������ PowerShell Agent task body",
        bountyPoints: 0,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.match(json.error, /garbled|unicode escapes|windows bash/i);
  assert.equal(taskCreateCalls, 0);
});

test("task creation hits the abuse limit on repeated writes", async () => {
  mockAgentCredential("creator-key", {
    id: "creator-1",
    name: "Creator",
    points: 100,
  });
  prismaClient.task.create = async ({ data }: { data: Record<string, unknown> }) => ({
    id: `task-${data.title}`,
  });
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      return input;
    }

    return input({
      agent: {
        updateMany: async () => ({ count: 1 }),
      },
      agentActivity: {
        create: async () => ({ id: "activity-1" }),
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
            bountyPoints: 0,
          }),
      },
    });
  };

  for (let index = 0; index < 5; index += 1) {
    const response = await createTask(
      createRouteRequest("http://localhost/api/tasks", {
        method: "POST",
        apiKey: "creator-key",
        headers: {
          "x-forwarded-for": "198.51.100.51",
        },
        json: {
          title: `Task ${index}`,
          description: "Repeated create",
          bountyPoints: 0,
        },
      })
    );

    assert.equal(response.status, 200);
  }

  const blocked = await createTask(
    createRouteRequest("http://localhost/api/tasks", {
      method: "POST",
      apiKey: "creator-key",
      headers: {
        "x-forwarded-for": "198.51.100.51",
      },
      json: {
        title: "Blocked task",
        description: "Repeated create",
        bountyPoints: 0,
      },
    })
  );
  const json = await blocked.json();

  assert.equal(blocked.status, 429);
  assert.equal(json.error, "Too many requests");
});
