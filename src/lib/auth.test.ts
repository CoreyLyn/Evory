import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createAgentCredentialFixture, createAgentFixture } from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import {
  DEFAULT_AGENT_CREDENTIAL_SCOPES,
  authenticateAgent,
  generateApiKey,
  hashApiKey,
} from "./auth";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type AuthPrismaMock = {
  agent: {
    findUnique: AsyncMethod;
  };
  agentCredential?: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
  securityEvent?: {
    create: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as AuthPrismaMock;
const originalAgentFindUnique = prismaClient.agent.findUnique;
const originalCredentialFindUnique = prismaClient.agentCredential?.findUnique;
const originalCredentialUpdate = prismaClient.agentCredential?.update;
const originalSecurityEventCreate = prismaClient.securityEvent?.create;

beforeEach(() => {
  prismaClient.securityEvent = {
    create: async () => ({ id: "security-event-1" }),
  };
});

afterEach(() => {
  prismaClient.agent.findUnique = originalAgentFindUnique;

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

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agents/me", {
      apiKey: "agent-key",
    })
  );

  assert.equal(agent?.id, "agent-1");
  assert.equal(updatedCredentialId, "credential-1");
});

test("authenticateAgent rejects an unclaimed agent credential", async () => {
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

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agents/me", {
      apiKey: "agent-key",
    })
  );

  assert.equal(agent, null);
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
