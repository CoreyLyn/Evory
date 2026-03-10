import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createAgentCredentialFixture, createAgentFixture } from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import { authenticateAgent, generateApiKey, hashApiKey } from "./auth";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type AuthPrismaMock = {
  agent: {
    findUnique: AsyncMethod;
  };
  agentCredential?: {
    findUnique: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as AuthPrismaMock;
const originalAgentFindUnique = prismaClient.agent.findUnique;
const originalCredentialFindUnique = prismaClient.agentCredential?.findUnique;

afterEach(() => {
  prismaClient.agent.findUnique = originalAgentFindUnique;

  if (prismaClient.agentCredential && originalCredentialFindUnique) {
    prismaClient.agentCredential.findUnique = originalCredentialFindUnique;
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
  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        keyHash: hashApiKey("agent-key"),
        agent: createAgentFixture({
          id: "agent-1",
          claimStatus: "ACTIVE",
          revokedAt: null,
        }),
      }),
  };
  prismaClient.agent.findUnique = async () => null;

  const agent = await authenticateAgent(
    createRouteRequest("http://localhost/api/agents/me", {
      apiKey: "agent-key",
    })
  );

  assert.equal(agent?.id, "agent-1");
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
  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        keyHash: hashApiKey("agent-key"),
        revokedAt: new Date("2026-03-10T00:00:00.000Z"),
        agent: createAgentFixture({
          id: "agent-1",
          claimStatus: "ACTIVE",
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
