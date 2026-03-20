import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createAgentCredentialFixture, createAgentFixture } from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import {
  DEFAULT_AGENT_CREDENTIAL_SCOPES,
  authenticateAgent,
  authenticateAgentRequest,
  generateApiKey,
  hashApiKey,
} from "./auth";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type AuthPrismaMock = {
  agent: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
  agentCredential?: {
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
  agentActivity?: {
    create: AsyncMethod;
  };
  securityEvent?: {
    create: AsyncMethod;
  };
  $transaction: (input: unknown) => Promise<unknown>;
};

const prismaClient = prisma as unknown as AuthPrismaMock;
const originalAgentFindUnique = prismaClient.agent.findUnique;
const originalAgentUpdate = prismaClient.agent.update;
const originalCredentialFindUnique = prismaClient.agentCredential?.findUnique;
const originalCredentialUpdate = prismaClient.agentCredential?.update;
const originalPointTransactionCreate = prismaClient.pointTransaction.create;
const originalDailyCheckinFindUnique = prismaClient.dailyCheckin.findUnique;
const originalDailyCheckinUpsert = prismaClient.dailyCheckin.upsert;
const originalDailyCheckinUpdate = prismaClient.dailyCheckin.update;
const originalAgentActivityCreate = prismaClient.agentActivity?.create;
const originalSecurityEventCreate = prismaClient.securityEvent?.create;
const originalTransaction = prismaClient.$transaction;
const originalConsoleError = console.error;

beforeEach(() => {
  prismaClient.pointTransaction.create = async ({ data }) => data;
  prismaClient.dailyCheckin.findUnique = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
  prismaClient.dailyCheckin.upsert = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
  prismaClient.dailyCheckin.update = async ({ data }) => ({
    id: "checkin-1",
    actions: data.actions,
  });
  prismaClient.agentActivity = {
    create: async () => ({ id: "activity-1" }),
  };
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
  prismaClient.securityEvent = {
    create: async () => ({ id: "security-event-1" }),
  };
});

afterEach(() => {
  prismaClient.agent.findUnique = originalAgentFindUnique;
  prismaClient.agent.update = originalAgentUpdate;
  prismaClient.pointTransaction.create = originalPointTransactionCreate;
  prismaClient.dailyCheckin.findUnique = originalDailyCheckinFindUnique;
  prismaClient.dailyCheckin.upsert = originalDailyCheckinUpsert;
  prismaClient.dailyCheckin.update = originalDailyCheckinUpdate;
  if (prismaClient.agentActivity && originalAgentActivityCreate) {
    prismaClient.agentActivity.create = originalAgentActivityCreate;
  }
  prismaClient.$transaction = originalTransaction;
  console.error = originalConsoleError;

  if (prismaClient.agentCredential && originalCredentialFindUnique) {
    prismaClient.agentCredential.findUnique = originalCredentialFindUnique;
  }
  if (prismaClient.agentCredential && originalCredentialUpdate) {
    prismaClient.agentCredential.update = originalCredentialUpdate;
  }
  if (prismaClient.securityEvent && originalSecurityEventCreate) {
    prismaClient.securityEvent.create = originalSecurityEventCreate;
  }
});

test("generateApiKey does not rely on Math.random", () => {
  const originalRandom = Math.random;
  let randomCalls = 0;

  Math.random = () => {
    randomCalls += 1;
    return 0;
  };

  try {
    const apiKey = generateApiKey();

    assert.match(
      apiKey,
      /^evory_[A-Za-z0-9]{8}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{12}$/
    );
    assert.equal(randomCalls, 0);
  } finally {
    Math.random = originalRandom;
  }
});

test("hashApiKey is deterministic and not equal to the raw key", () => {
  const raw = "evory_test_key";

  assert.equal(hashApiKey(raw), hashApiKey(raw));
  assert.notEqual(hashApiKey(raw), raw);
});

test("authenticateAgent returns an active claimed agent from credential lookup", async () => {
  let updatedCredentialId = "";
  let updatedAgentId = "";

  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        id: "credential-1",
        keyHash: hashApiKey("agent-key"),
        scopes: [...DEFAULT_AGENT_CREDENTIAL_SCOPES],
        expiresAt: new Date("2026-04-10T00:00:00.000Z"),
        agent: createAgentFixture({
          id: "agent-1",
          claimStatus: "ACTIVE",
          revokedAt: null,
        }),
      }),
    update: async ({ where }: { where: { id: string } }) => {
      updatedCredentialId = where.id;
      return createAgentCredentialFixture({
        id: where.id,
      });
    },
  };
  prismaClient.agent.findUnique = async () => null;
  prismaClient.agent.update = async ({ where }: { where: { id: string } }) => {
    updatedAgentId = where.id;
    return createAgentFixture({
      id: where.id,
      claimStatus: "ACTIVE",
      revokedAt: null,
      lastSeenAt: "2026-03-10T00:00:00.000Z",
    });
  };

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agents/me", {
      apiKey: "agent-key",
    })
  );

  assert.equal(agent?.id, "agent-1");
  assert.equal(updatedCredentialId, "credential-1");
  assert.equal(updatedAgentId, "agent-1");
});

test("authenticateAgent awards daily login on the first authenticated request of the day", async () => {
  let createdPointTransaction: Record<string, unknown> | null = null;
  let recordedActions: Record<string, unknown> | null = null;

  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        id: "credential-1",
        keyHash: hashApiKey("agent-key"),
        scopes: [...DEFAULT_AGENT_CREDENTIAL_SCOPES],
        expiresAt: new Date("2026-04-10T00:00:00.000Z"),
        agent: createAgentFixture({
          id: "agent-1",
          claimStatus: "ACTIVE",
          revokedAt: null,
        }),
      }),
    update: async () => createAgentCredentialFixture(),
  };
  prismaClient.agent.findUnique = async () => null;
  prismaClient.agent.update = async ({ where }: { where: { id: string } }) =>
    createAgentFixture({
      id: where.id,
      claimStatus: "ACTIVE",
      revokedAt: null,
      lastSeenAt: "2026-03-10T00:00:00.000Z",
    });
  prismaClient.pointTransaction.create = async ({
    data,
  }: {
    data: Record<string, unknown>;
  }) => {
    createdPointTransaction = data;
    return data;
  };
  prismaClient.dailyCheckin.findUnique = async () => null;
  prismaClient.dailyCheckin.upsert = async () => ({
    id: "checkin-1",
    actions: {},
  });
  prismaClient.dailyCheckin.update = async ({
    data,
  }: {
    data: { actions: Record<string, unknown> };
  }) => {
    recordedActions = data.actions;
    return { id: "checkin-1", actions: data.actions };
  };
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

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agent/tasks", {
      apiKey: "agent-key",
    })
  );

  assert.equal(agent?.id, "agent-1");
  assert.equal(createdPointTransaction?.type, "DAILY_LOGIN");
  assert.equal(createdPointTransaction?.agentId, "agent-1");
  assert.deepEqual(recordedActions, { DAILY_LOGIN: true });
});

test("authenticateAgent rejects an unclaimed agent credential", async () => {
  let updatedAgentId = "";

  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        keyHash: hashApiKey("agent-key"),
        agent: createAgentFixture({
          id: "agent-1",
          claimStatus: "UNCLAIMED",
          ownerUserId: null,
          claimedAt: null,
        }),
      }),
  };
  prismaClient.agent.findUnique = async () => null;
  prismaClient.agent.update = async ({ where }: { where: { id: string } }) => {
    updatedAgentId = where.id;
    return createAgentFixture({ id: where.id });
  };

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agents/me", {
      apiKey: "agent-key",
    })
  );

  assert.equal(agent, null);
  assert.equal(updatedAgentId, "");
});

test("authenticateAgent rejects a revoked credential", async () => {
  let createdEvent: Record<string, unknown> | null = null;

  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        id: "credential-revoked",
        keyHash: hashApiKey("agent-key"),
        revokedAt: new Date("2026-03-10T00:00:00.000Z"),
        agent: createAgentFixture({
          id: "agent-1",
          name: "Revoked Agent",
          claimStatus: "ACTIVE",
        }),
      }),
    update: async () => createAgentCredentialFixture(),
  };
  prismaClient.agent.findUnique = async () => null;
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdEvent = data;
      return data;
    },
  };

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agents/me", {
      apiKey: "agent-key",
    })
  );

  assert.equal(agent, null);
  assert.deepEqual(createdEvent, {
    type: "INVALID_AGENT_CREDENTIAL",
    routeKey: "/api/agents/me",
    ipAddress: "unknown",
    userId: null,
    metadata: {
      scope: "credential",
      severity: "warning",
      operation: "agent_auth",
      summary: "Agent credential was rejected during authentication.",
      reason: "revoked",
      agentId: "agent-1",
      agentName: "Revoked Agent",
    },
  });
});

test("authenticateAgentRequest returns revoked failure reason", async () => {
  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        id: "credential-revoked",
        keyHash: hashApiKey("agent-key"),
        revokedAt: new Date("2026-03-10T00:00:00.000Z"),
        agent: createAgentFixture({
          id: "agent-1",
          claimStatus: "ACTIVE",
        }),
      }),
    update: async () => createAgentCredentialFixture(),
  };

  const result = await authenticateAgentRequest(
    createRouteRequest("http://localhost/api/agent/tasks", {
      apiKey: "agent-key",
    })
  );

  assert.equal(result.context, null);
  assert.equal(result.failureReason, "revoked");
});

test("authenticateAgent rejects expired credentials", async () => {
  let createdEvent: Record<string, unknown> | null = null;

  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        id: "credential-expired",
        keyHash: hashApiKey("agent-key"),
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
        agent: createAgentFixture({
          id: "agent-expired",
          name: "Expired Agent",
          claimStatus: "ACTIVE",
        }),
      }),
    update: async () => createAgentCredentialFixture(),
  };
  prismaClient.agent.findUnique = async () => null;
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdEvent = data;
      return data;
    },
  };

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agents/me", {
      apiKey: "agent-key",
    })
  );

  assert.equal(agent, null);
  assert.equal((createdEvent?.metadata as Record<string, unknown>).reason, "expired");
});

test("authenticateAgentRequest returns expired failure reason", async () => {
  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        id: "credential-expired",
        keyHash: hashApiKey("agent-key"),
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
        agent: createAgentFixture({
          id: "agent-expired",
          claimStatus: "ACTIVE",
        }),
      }),
    update: async () => createAgentCredentialFixture(),
  };

  const result = await authenticateAgentRequest(
    createRouteRequest("http://localhost/api/agent/tasks", {
      apiKey: "agent-key",
    })
  );

  assert.equal(result.context, null);
  assert.equal(result.failureReason, "expired");
});

test("authenticateAgentRequest returns inactive-agent failure reason", async () => {
  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        keyHash: hashApiKey("agent-key"),
        agent: createAgentFixture({
          id: "agent-1",
          claimStatus: "UNCLAIMED",
          ownerUserId: null,
          claimedAt: null,
        }),
      }),
    update: async () => createAgentCredentialFixture(),
  };

  const result = await authenticateAgentRequest(
    createRouteRequest("http://localhost/api/agent/tasks", {
      apiKey: "agent-key",
    })
  );

  assert.equal(result.context, null);
  assert.equal(result.failureReason, "inactive-agent");
});

test("authenticateAgentRequest returns missing_header when authorization is absent", async () => {
  const result = await authenticateAgentRequest(
    createRouteRequest("http://localhost/api/agent/tasks")
  );

  assert.equal(result.context, null);
  assert.equal(result.failureReason, "missing_header");
});

test("authenticateAgent rejects credentials with malformed scopes", async () => {
  let updated = false;
  let createdEvent: Record<string, unknown> | null = null;

  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        id: "credential-malformed-scopes",
        keyHash: hashApiKey("agent-key"),
        scopes: { forum: "write" },
        agent: createAgentFixture({
          id: "agent-malformed-scopes",
          name: "Malformed Scope Agent",
          claimStatus: "ACTIVE",
        }),
      }),
    update: async () => {
      updated = true;
      return createAgentCredentialFixture();
    },
  };
  prismaClient.agent.findUnique = async () => null;
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdEvent = data;
      return data;
    },
  };

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agents/me", {
      apiKey: "agent-key",
    })
  );

  assert.equal(agent, null);
  assert.equal(updated, false);
  assert.equal((createdEvent?.metadata as Record<string, unknown>).reason, "invalid-scopes");
});

test("authenticateAgent rejects credentials with empty scopes", async () => {
  let updated = false;
  let createdEvent: Record<string, unknown> | null = null;

  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        id: "credential-empty-scopes",
        keyHash: hashApiKey("agent-key"),
        scopes: [],
        agent: createAgentFixture({
          id: "agent-empty-scopes",
          name: "Empty Scope Agent",
          claimStatus: "ACTIVE",
        }),
      }),
    update: async () => {
      updated = true;
      return createAgentCredentialFixture();
    },
  };
  prismaClient.agent.findUnique = async () => null;
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdEvent = data;
      return data;
    },
  };

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agents/me", {
      apiKey: "agent-key",
    })
  );

  assert.equal(agent, null);
  assert.equal(updated, false);
  assert.equal((createdEvent?.metadata as Record<string, unknown>).reason, "invalid-scopes");
});

test("authenticateAgent logs invalid credentials without falling back to legacy agent apiKey lookups", async () => {
  let createdEvent: Record<string, unknown> | null = null;

  prismaClient.agentCredential = {
    findUnique: async () => null,
    update: async () => createAgentCredentialFixture(),
  };
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "legacy-agent",
      claimStatus: "ACTIVE",
    });
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdEvent = data;
      return data;
    },
  };

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agents/me", {
      apiKey: "legacy-only-key",
      headers: {
        "x-forwarded-for": "203.0.113.10",
      },
    })
  );

  assert.equal(agent, null);
  assert.deepEqual(createdEvent, {
    type: "INVALID_AGENT_CREDENTIAL",
    routeKey: "/api/agents/me",
    ipAddress: "203.0.113.10",
    userId: null,
    metadata: {
      scope: "credential",
      severity: "warning",
      operation: "agent_auth",
      summary: "Agent credential was rejected during authentication.",
      reason: "not-found",
    },
  });
});

test("authenticateAgent logs infrastructure failures separately from invalid credentials", async () => {
  let createdEvent = false;
  const consoleErrors: unknown[][] = [];

  console.error = (...args: unknown[]) => {
    consoleErrors.push(args);
  };
  prismaClient.agentCredential = {
    findUnique: async () => {
      throw new Error("database unavailable");
    },
    update: async () => createAgentCredentialFixture(),
  };
  prismaClient.agent.findUnique = async () => null;
  prismaClient.securityEvent = {
    create: async () => {
      createdEvent = true;
      return { id: "security-event-1" };
    },
  };

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agents/me", {
      apiKey: "agent-key",
    })
  );

  assert.equal(agent, null);
  assert.equal(createdEvent, false);
  assert.equal(consoleErrors.length, 1);
  assert.equal(consoleErrors[0]?.[0], "[auth/authenticate-agent-context]");
});

test("authenticateAgent tolerates lastSeenAt refresh failures after successful auth", async () => {
  const consoleErrors: unknown[][] = [];

  console.error = (...args: unknown[]) => {
    consoleErrors.push(args);
  };
  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        id: "credential-1",
        keyHash: hashApiKey("agent-key"),
        scopes: [...DEFAULT_AGENT_CREDENTIAL_SCOPES],
        expiresAt: new Date("2026-04-10T00:00:00.000Z"),
        agent: createAgentFixture({
          id: "agent-1",
          claimStatus: "ACTIVE",
          revokedAt: null,
        }),
      }),
    update: async () => createAgentCredentialFixture(),
  };
  prismaClient.agent.findUnique = async () => null;
  prismaClient.agent.update = async () => {
    throw new Error("last seen write failed");
  };

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agents/me", {
      apiKey: "agent-key",
    })
  );

  assert.equal(agent?.id, "agent-1");
  assert.equal(consoleErrors.length, 1);
  assert.equal(consoleErrors[0]?.[0], "[auth/update-agent-last-seen]");
});
