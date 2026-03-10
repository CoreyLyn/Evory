import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { hashApiKey } from "@/lib/auth";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { USER_SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/user-auth";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createAgentClaimAuditFixture,
  createSecurityEventFixture,
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import { POST as claimAgent } from "./claim/route";
import { POST as registerAgent } from "./register/route";
import { GET as listOwnedAgents } from "../users/me/agents/route";
import { GET as getOwnedAgent } from "../users/me/agents/[id]/route";
import { GET as listSecurityEvents } from "../users/me/security-events/route";
import { POST as revokeOwnedAgent } from "../users/me/agents/[id]/revoke/route";
import { POST as rotateOwnedAgentKey } from "../users/me/agents/[id]/rotate-key/route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type AgentClaimPrismaMock = {
  agent: {
    findUnique: AsyncMethod;
    create: AsyncMethod;
    update: AsyncMethod;
    findMany: AsyncMethod;
  };
  agentCredential?: {
    create: AsyncMethod;
    findUnique: AsyncMethod;
    updateMany: AsyncMethod;
  };
  agentClaimAudit?: {
    create: AsyncMethod;
  };
  securityEvent?: {
    create: AsyncMethod;
    findMany: AsyncMethod;
  };
  userSession?: {
    findUnique: AsyncMethod;
    deleteMany: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as AgentClaimPrismaMock;
const originalAgentFindUnique = prismaClient.agent.findUnique;
const originalAgentCreate = prismaClient.agent.create;
const originalAgentUpdate = prismaClient.agent.update;
const originalAgentFindMany = prismaClient.agent.findMany;
const originalCredentialCreate = prismaClient.agentCredential?.create;
const originalCredentialFindUnique = prismaClient.agentCredential?.findUnique;
const originalCredentialUpdateMany = prismaClient.agentCredential?.updateMany;
const originalAuditCreate = prismaClient.agentClaimAudit?.create;
const originalSecurityEventCreate = prismaClient.securityEvent?.create;
const originalSecurityEventFindMany = prismaClient.securityEvent?.findMany;
const originalUserSessionFindUnique = prismaClient.userSession?.findUnique;
const originalUserSessionDeleteMany = prismaClient.userSession?.deleteMany;

afterEach(() => {
  resetRateLimitStore();
  prismaClient.agent.findUnique = originalAgentFindUnique;
  prismaClient.agent.create = originalAgentCreate;
  prismaClient.agent.update = originalAgentUpdate;
  prismaClient.agent.findMany = originalAgentFindMany;

  if (prismaClient.agentCredential && originalCredentialCreate) {
    prismaClient.agentCredential.create = originalCredentialCreate;
  }
  if (prismaClient.agentCredential && originalCredentialFindUnique) {
    prismaClient.agentCredential.findUnique = originalCredentialFindUnique;
  }
  if (prismaClient.agentCredential && originalCredentialUpdateMany) {
    prismaClient.agentCredential.updateMany = originalCredentialUpdateMany;
  }
  if (prismaClient.agentClaimAudit && originalAuditCreate) {
    prismaClient.agentClaimAudit.create = originalAuditCreate;
  }
  if (prismaClient.securityEvent && originalSecurityEventCreate) {
    prismaClient.securityEvent.create = originalSecurityEventCreate;
  }
  if (prismaClient.securityEvent && originalSecurityEventFindMany) {
    prismaClient.securityEvent.findMany = originalSecurityEventFindMany;
  }
  if (prismaClient.userSession && originalUserSessionFindUnique) {
    prismaClient.userSession.findUnique = originalUserSessionFindUnique;
  }
  if (prismaClient.userSession && originalUserSessionDeleteMany) {
    prismaClient.userSession.deleteMany = originalUserSessionDeleteMany;
  }
});

test("register creates an unclaimed agent and returns its raw api key", async () => {
  let createdCredentialHash = "";
  let createdAgentData: Record<string, unknown> | null = null;

  prismaClient.agent.findUnique = async ({
    where,
  }: {
    where: { name?: string; apiKey?: string };
  }) => {
    if (where.apiKey) {
      throw new Error("legacy agent apiKey lookup should not run during registration");
    }

    return where.name === "New Agent" ? null : null;
  };
  prismaClient.agent.create = async ({ data }: { data: Record<string, unknown> }) => {
    createdAgentData = data;

    return createAgentFixture({
      id: "agent-1",
      name: data.name,
      type: data.type,
      apiKey: null,
      ownerUserId: null,
      claimStatus: "UNCLAIMED",
      claimedAt: null,
      status: "OFFLINE",
      points: 0,
    });
  };
  prismaClient.agentCredential = {
    create: async ({ data }: { data: { keyHash: string } }) => {
      createdCredentialHash = data.keyHash;
      return createAgentCredentialFixture({
        keyHash: data.keyHash,
      });
    },
    findUnique: async () => null,
  };

  const response = await registerAgent(
    createRouteRequest("http://localhost/api/agents/register", {
      method: "POST",
      json: {
        name: "New Agent",
        type: "CUSTOM",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.claimStatus, "UNCLAIMED");
  assert.match(json.data.apiKey, /^evory_/);
  assert.equal(createdCredentialHash, hashApiKey(json.data.apiKey));
  assert.equal(createdAgentData?.apiKey, undefined);
});

test("claim binds an unclaimed agent to the current user", async () => {
  const token = "claim-session-token";

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-1",
              email: "owner@example.com",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.agentCredential = {
    create: async () => createAgentCredentialFixture(),
    findUnique: async ({ where }: { where: { keyHash: string } }) =>
      where.keyHash === hashApiKey("evory_claim_key")
        ? createAgentCredentialFixture({
            keyHash: where.keyHash,
            agent: createAgentFixture({
              id: "agent-1",
              name: "Claimable Agent",
              ownerUserId: null,
              claimStatus: "UNCLAIMED",
              claimedAt: null,
            }),
          })
        : null,
  };
  prismaClient.agent.update = async () =>
    createAgentFixture({
      id: "agent-1",
      name: "Claimable Agent",
      ownerUserId: "user-1",
      claimStatus: "ACTIVE",
    });
  prismaClient.agentClaimAudit = {
    create: async () => ({ id: "audit-1" }),
  };

  const response = await claimAgent(
    createRouteRequest("http://localhost/api/agents/claim", {
      method: "POST",
      headers: {
        cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
      },
      json: {
        apiKey: "evory_claim_key",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.claimStatus, "ACTIVE");
  assert.equal(json.data.ownerUserId, "user-1");
});

test("claim returns conflict when the agent is already claimed", async () => {
  const token = "claimed-session-token";

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-2",
              email: "second-owner@example.com",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.agentCredential = {
    create: async () => createAgentCredentialFixture(),
    findUnique: async ({ where }: { where: { keyHash: string } }) =>
      where.keyHash === hashApiKey("evory_taken_key")
        ? createAgentCredentialFixture({
            keyHash: where.keyHash,
            agent: createAgentFixture({
              id: "agent-1",
              ownerUserId: "user-1",
              claimStatus: "ACTIVE",
            }),
          })
        : null,
  };
  prismaClient.agentClaimAudit = {
    create: async () => ({ id: "audit-1" }),
  };

  const response = await claimAgent(
    createRouteRequest("http://localhost/api/agents/claim", {
      method: "POST",
      headers: {
        cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
      },
      json: {
        apiKey: "evory_taken_key",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.error, "Agent has already been claimed");
});

test("owned agents list returns active agents with masked credential metadata", async () => {
  const token = "list-session-token";

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-1",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.agent.findMany = async () => [
    createAgentFixture({
      id: "agent-1",
      ownerUserId: "user-1",
      name: "Owned Agent",
      claimStatus: "ACTIVE",
      credentials: [
        createAgentCredentialFixture({
          last4: "abcd",
          label: "default",
        }),
      ],
      claimAudits: [
        createAgentClaimAuditFixture({
          action: "ROTATE_KEY",
          createdAt: new Date("2026-03-10T10:00:00.000Z"),
        }),
        createAgentClaimAuditFixture({
          id: "audit-2",
          action: "CLAIM",
          createdAt: new Date("2026-03-09T10:00:00.000Z"),
        }),
      ],
    }),
  ];

  const response = await listOwnedAgents(
    createRouteRequest("http://localhost/api/users/me/agents", {
      headers: {
        cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data[0].name, "Owned Agent");
  assert.equal(json.data[0].credentialLast4, "abcd");
  assert.deepEqual(json.data[0].recentAudits, [
    {
      id: "audit-1",
      action: "ROTATE_KEY",
      createdAt: "2026-03-10T10:00:00.000Z",
    },
    {
      id: "audit-2",
      action: "CLAIM",
      createdAt: "2026-03-09T10:00:00.000Z",
    },
  ]);
});

test("owned agent detail returns the claimed agent for the current user", async () => {
  const token = "detail-session-token";

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-1",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "agent-1",
      ownerUserId: "user-1",
      name: "Owned Agent",
      claimStatus: "ACTIVE",
      credentials: [
        createAgentCredentialFixture({
          last4: "abcd",
        }),
      ],
    });

  const response = await getOwnedAgent(
    createRouteRequest("http://localhost/api/users/me/agents/agent-1", {
      headers: {
        cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
      },
    }),
    { params: Promise.resolve({ id: "agent-1" }) }
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.id, "agent-1");
  assert.equal(json.data.credentialLast4, "abcd");
});

test("rotate-key revokes the previous credential and returns a new raw key", async () => {
  const token = "rotate-session-token";
  let revokedCredentialCount = 0;
  let createdCredentialHash = "";
  let updatedAgentData: Record<string, unknown> | null = null;

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-1",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.agent.findUnique = async ({ where }: { where: Record<string, string> }) => {
    if (where.apiKey) {
      throw new Error("legacy agent apiKey lookup should not run during key rotation");
    }

    if (where.id === "agent-1") {
      return createAgentFixture({
        id: "agent-1",
        ownerUserId: "user-1",
        claimStatus: "ACTIVE",
      });
    }

    return null;
  };
  prismaClient.agent.update = async ({ data }: { data: Record<string, unknown> }) => {
    updatedAgentData = data;

    return createAgentFixture({
      id: "agent-1",
      ownerUserId: "user-1",
      claimStatus: "ACTIVE",
      apiKey: null,
    });
  };
  prismaClient.agentCredential = {
    create: async ({ data }: { data: { keyHash: string } }) => {
      createdCredentialHash = data.keyHash;
      return createAgentCredentialFixture({
        keyHash: data.keyHash,
      });
    },
    findUnique: async () => null,
    updateMany: async () => {
      revokedCredentialCount += 1;
      return { count: 1 };
    },
  };
  prismaClient.agentClaimAudit = {
    create: async () => ({ id: "audit-1" }),
  };

  const response = await rotateOwnedAgentKey(
    createRouteRequest("http://localhost/api/users/me/agents/agent-1/rotate-key", {
      method: "POST",
      headers: {
        cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
      },
    }),
    { params: Promise.resolve({ id: "agent-1" }) }
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.match(json.data.apiKey, /^evory_/);
  assert.equal(createdCredentialHash, hashApiKey(json.data.apiKey));
  assert.equal(revokedCredentialCount, 1);
  assert.equal(updatedAgentData?.apiKey, undefined);
});

test("revoke marks the agent as revoked for the owning user", async () => {
  const token = "revoke-session-token";
  let revokedCredentialCount = 0;

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-1",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "agent-1",
      ownerUserId: "user-1",
      claimStatus: "ACTIVE",
    });
  prismaClient.agent.update = async () =>
    createAgentFixture({
      id: "agent-1",
      ownerUserId: "user-1",
      claimStatus: "REVOKED",
      revokedAt: "2026-03-10T00:00:00.000Z",
    });
  prismaClient.agentCredential = {
    create: async () => createAgentCredentialFixture(),
    findUnique: async () => null,
    updateMany: async () => {
      revokedCredentialCount += 1;
      return { count: 1 };
    },
  };
  prismaClient.agentClaimAudit = {
    create: async () => ({ id: "audit-1" }),
  };

  const response = await revokeOwnedAgent(
    createRouteRequest("http://localhost/api/users/me/agents/agent-1/revoke", {
      method: "POST",
      headers: {
        cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
      },
    }),
    { params: Promise.resolve({ id: "agent-1" }) }
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.claimStatus, "REVOKED");
  assert.equal(revokedCredentialCount, 1);
});

test("register rate limits repeated self-registration attempts from the same ip", async () => {
  let createCount = 0;
  const securityEvents: Array<Record<string, unknown>> = [];

  prismaClient.agent.findUnique = async () => null;
  prismaClient.agent.create = async () => {
    createCount += 1;
    return createAgentFixture({
      id: `agent-${createCount}`,
      name: `Rate Limited Agent ${createCount}`,
      ownerUserId: null,
      claimStatus: "UNCLAIMED",
      claimedAt: null,
      status: "OFFLINE",
      points: 0,
    });
  };
  prismaClient.agentCredential = {
    create: async () => createAgentCredentialFixture(),
    findUnique: async () => null,
  };
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      securityEvents.push(data);
      return createSecurityEventFixture({
        ...data,
        userId: null,
      });
    },
    findMany: async () => [],
  };

  for (let index = 0; index < 3; index += 1) {
    const response = await registerAgent(
      createRouteRequest("http://localhost/api/agents/register", {
        method: "POST",
        headers: {
          "x-forwarded-for": "198.51.100.10",
        },
        json: {
          name: `Rate Limited Agent ${index}`,
          type: "CUSTOM",
        },
      })
    );

    assert.equal(response.status, 200);
  }

  const blocked = await registerAgent(
    createRouteRequest("http://localhost/api/agents/register", {
      method: "POST",
      headers: {
        "x-forwarded-for": "198.51.100.10",
      },
      json: {
        name: "Rate Limited Agent blocked",
        type: "CUSTOM",
      },
    })
  );
  const json = await blocked.json();

  assert.equal(blocked.status, 429);
  assert.equal(json.error, "Too many requests");
  assert.equal(typeof json.retryAfterSeconds, "number");
  assert.equal(createCount, 3);
  assert.equal(securityEvents.length, 1);
  assert.equal(securityEvents[0].routeKey, "agent-register");
  assert.equal(securityEvents[0].userId, null);
  assert.equal(securityEvents[0].ipAddress, "198.51.100.10");
  assert.equal((securityEvents[0].metadata as Record<string, unknown>).scope, "anonymous");
  assert.equal((securityEvents[0].metadata as Record<string, unknown>).severity, "warning");
  assert.equal((securityEvents[0].metadata as Record<string, unknown>).operation, "agent_registration");
});

test("claim rate limits repeated key claims for the same user and ip", async () => {
  const token = "claim-rate-limit-token";
  let updateCount = 0;
  const securityEvents: Array<Record<string, unknown>> = [];

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({ id: "user-rate-1" }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.agentCredential = {
    create: async () => createAgentCredentialFixture(),
    findUnique: async ({ where }: { where: { keyHash: string } }) =>
      createAgentCredentialFixture({
        keyHash: where.keyHash,
        agent: createAgentFixture({
          id: `agent-${updateCount + 1}`,
          ownerUserId: null,
          claimStatus: "UNCLAIMED",
          claimedAt: null,
        }),
      }),
  };
  prismaClient.agent.update = async () => {
    updateCount += 1;
    return createAgentFixture({
      id: `agent-${updateCount}`,
      ownerUserId: "user-rate-1",
      claimStatus: "ACTIVE",
    });
  };
  prismaClient.agentClaimAudit = {
    create: async () => ({ id: `audit-${updateCount}` }),
  };
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      securityEvents.push(data);
      return createSecurityEventFixture(data);
    },
    findMany: async () => [],
  };

  for (let index = 0; index < 5; index += 1) {
    const response = await claimAgent(
      createRouteRequest("http://localhost/api/agents/claim", {
        method: "POST",
        headers: {
          cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
          "x-forwarded-for": "198.51.100.11",
        },
        json: {
          apiKey: `evory_claim_rate_key_${index}`,
        },
      })
    );

    assert.equal(response.status, 200);
  }

  const blocked = await claimAgent(
    createRouteRequest("http://localhost/api/agents/claim", {
      method: "POST",
      headers: {
        cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
        "x-forwarded-for": "198.51.100.11",
      },
      json: {
        apiKey: "evory_claim_rate_key_blocked",
      },
    })
  );
  const json = await blocked.json();

  assert.equal(blocked.status, 429);
  assert.equal(json.error, "Too many requests");
  assert.equal(typeof json.retryAfterSeconds, "number");
  assert.equal(updateCount, 5);
  assert.equal(securityEvents.length, 1);
  assert.equal(securityEvents[0].type, "RATE_LIMIT_HIT");
  assert.equal(securityEvents[0].routeKey, "agent-claim");
  assert.equal(securityEvents[0].userId, "user-rate-1");
  assert.equal(securityEvents[0].ipAddress, "198.51.100.11");
  assert.equal((securityEvents[0].metadata as Record<string, unknown>).scope, "user");
  assert.equal((securityEvents[0].metadata as Record<string, unknown>).severity, "warning");
  assert.equal((securityEvents[0].metadata as Record<string, unknown>).operation, "agent_claim");
});

test("rotate-key rate limits repeated credential rotations for the same user and ip", async () => {
  const token = "rotate-rate-limit-token";
  let updateCount = 0;
  const securityEvents: Array<Record<string, unknown>> = [];

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({ id: "user-rate-2" }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "agent-rotate-rate",
      ownerUserId: "user-rate-2",
      claimStatus: "ACTIVE",
    });
  prismaClient.agent.update = async () => {
    updateCount += 1;
    return createAgentFixture({
      id: "agent-rotate-rate",
      ownerUserId: "user-rate-2",
      claimStatus: "ACTIVE",
    });
  };
  prismaClient.agentCredential = {
    create: async () => createAgentCredentialFixture(),
    findUnique: async () => null,
    updateMany: async () => ({ count: 1 }),
  };
  prismaClient.agentClaimAudit = {
    create: async () => ({ id: `audit-${updateCount}` }),
  };
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      securityEvents.push(data);
      return createSecurityEventFixture(data);
    },
    findMany: async () => [],
  };

  for (let index = 0; index < 5; index += 1) {
    const response = await rotateOwnedAgentKey(
      createRouteRequest("http://localhost/api/users/me/agents/agent-rotate-rate/rotate-key", {
        method: "POST",
        headers: {
          cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
          "x-forwarded-for": "198.51.100.12",
        },
      }),
      { params: Promise.resolve({ id: "agent-rotate-rate" }) }
    );

    assert.equal(response.status, 200);
  }

  const blocked = await rotateOwnedAgentKey(
    createRouteRequest("http://localhost/api/users/me/agents/agent-rotate-rate/rotate-key", {
      method: "POST",
      headers: {
        cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
        "x-forwarded-for": "198.51.100.12",
      },
    }),
    { params: Promise.resolve({ id: "agent-rotate-rate" }) }
  );
  const json = await blocked.json();

  assert.equal(blocked.status, 429);
  assert.equal(json.error, "Too many requests");
  assert.equal(typeof json.retryAfterSeconds, "number");
  assert.equal(updateCount, 5);
  assert.equal(securityEvents.length, 1);
  assert.equal(securityEvents[0].routeKey, "agent-rotate-key");
  assert.equal(securityEvents[0].userId, "user-rate-2");
  assert.equal(securityEvents[0].ipAddress, "198.51.100.12");
  assert.equal((securityEvents[0].metadata as Record<string, unknown>).scope, "credential");
  assert.equal((securityEvents[0].metadata as Record<string, unknown>).severity, "high");
  assert.equal((securityEvents[0].metadata as Record<string, unknown>).operation, "credential_rotation");
});

test("revoke rate limits repeated revocations for the same user and ip", async () => {
  const token = "revoke-rate-limit-token";
  let updateCount = 0;
  const securityEvents: Array<Record<string, unknown>> = [];

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({ id: "user-rate-3" }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "agent-revoke-rate",
      ownerUserId: "user-rate-3",
      claimStatus: "ACTIVE",
    });
  prismaClient.agent.update = async () => {
    updateCount += 1;
    return createAgentFixture({
      id: "agent-revoke-rate",
      ownerUserId: "user-rate-3",
      claimStatus: "REVOKED",
      revokedAt: "2026-03-10T00:00:00.000Z",
    });
  };
  prismaClient.agentCredential = {
    create: async () => createAgentCredentialFixture(),
    findUnique: async () => null,
    updateMany: async () => ({ count: 1 }),
  };
  prismaClient.agentClaimAudit = {
    create: async () => ({ id: `audit-${updateCount}` }),
  };
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      securityEvents.push(data);
      return createSecurityEventFixture(data);
    },
    findMany: async () => [],
  };

  for (let index = 0; index < 5; index += 1) {
    const response = await revokeOwnedAgent(
      createRouteRequest("http://localhost/api/users/me/agents/agent-revoke-rate/revoke", {
        method: "POST",
        headers: {
          cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
          "x-forwarded-for": "198.51.100.13",
        },
      }),
      { params: Promise.resolve({ id: "agent-revoke-rate" }) }
    );

    assert.equal(response.status, 200);
  }

  const blocked = await revokeOwnedAgent(
    createRouteRequest("http://localhost/api/users/me/agents/agent-revoke-rate/revoke", {
      method: "POST",
      headers: {
        cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
        "x-forwarded-for": "198.51.100.13",
      },
    }),
    { params: Promise.resolve({ id: "agent-revoke-rate" }) }
  );
  const json = await blocked.json();

  assert.equal(blocked.status, 429);
  assert.equal(json.error, "Too many requests");
  assert.equal(typeof json.retryAfterSeconds, "number");
  assert.equal(updateCount, 5);
  assert.equal(securityEvents.length, 1);
  assert.equal(securityEvents[0].routeKey, "agent-revoke");
  assert.equal(securityEvents[0].userId, "user-rate-3");
  assert.equal(securityEvents[0].ipAddress, "198.51.100.13");
  assert.equal((securityEvents[0].metadata as Record<string, unknown>).scope, "credential");
  assert.equal((securityEvents[0].metadata as Record<string, unknown>).severity, "high");
  assert.equal((securityEvents[0].metadata as Record<string, unknown>).operation, "agent_revoke");
});

test("security events endpoint returns the current user's recent rate-limit hits", async () => {
  const token = "security-events-token";

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-security-1",
              email: "security@example.com",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
    findMany: async () => [
      createSecurityEventFixture({
        id: "security-event-1",
        userId: "user-security-1",
        routeKey: "agent-claim",
      }),
      createSecurityEventFixture({
        id: "security-event-2",
        userId: "user-security-1",
        routeKey: "agent-rotate-key",
        createdAt: new Date("2026-03-10T08:30:00.000Z"),
      }),
    ],
  };

  const response = await listSecurityEvents(
    createRouteRequest("http://localhost/api/users/me/security-events", {
      headers: {
        cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.length, 2);
  assert.equal(json.data[0].type, "RATE_LIMIT_HIT");
  assert.equal(json.data[0].routeKey, "agent-claim");
  assert.equal(json.data[0].scope, "user");
  assert.equal(json.data[0].severity, "warning");
  assert.equal(json.data[0].operation, "agent_claim");
  assert.equal(json.data[0].retryAfterSeconds, 120);
  assert.equal(json.data[0].summary, "Agent claim attempts were rate limited.");
});

test("security events endpoint applies severity, routeKey, and limit filters", async () => {
  const token = "security-events-filter-token";
  let findManyArgs: Record<string, unknown> | null = null;

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-security-filter-1",
              email: "security-filter@example.com",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
    findMany: async (args: Record<string, unknown>) => {
      findManyArgs = args;
      return [
        createSecurityEventFixture({
          routeKey: "agent-revoke",
          metadata: {
            scope: "credential",
            severity: "high",
            operation: "agent_revoke",
            summary: "Agent revoke attempts were rate limited.",
            retryAfterSeconds: 90,
          },
        }),
      ];
    },
  };

  const response = await listSecurityEvents(
    createRouteRequest(
      "http://localhost/api/users/me/security-events?severity=high&routeKey=agent-revoke&limit=2",
      {
        headers: {
          cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
        },
      }
    )
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal((findManyArgs?.where as Record<string, unknown>).userId, "user-security-filter-1");
  assert.equal((findManyArgs?.where as Record<string, unknown>).routeKey, "agent-revoke");
  assert.deepEqual(
    (findManyArgs?.where as Record<string, unknown>).metadata,
    {
      path: ["severity"],
      equals: "high",
    }
  );
  assert.equal(findManyArgs?.take, 3);
  assert.equal(findManyArgs?.skip, 0);
  assert.equal(json.data[0].severity, "high");
  assert.equal(json.data[0].routeKey, "agent-revoke");
  assert.equal(json.pagination.page, 1);
  assert.equal(json.pagination.limit, 2);
});

test("security events endpoint rejects invalid severity filters", async () => {
  const token = "security-events-invalid-filter-token";

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-security-invalid-1",
              email: "security-invalid@example.com",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
    findMany: async () => {
      throw new Error("should not query when severity is invalid");
    },
  };

  const response = await listSecurityEvents(
    createRouteRequest(
      "http://localhost/api/users/me/security-events?severity=critical",
      {
        headers: {
          cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
        },
      }
    )
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid severity filter");
});

test("security events endpoint applies a time range filter", async () => {
  const token = "security-events-range-filter-token";
  let findManyArgs: Record<string, unknown> | null = null;
  const beforeRequest = Date.now();

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-security-range-1",
              email: "security-range@example.com",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
    findMany: async (args: Record<string, unknown>) => {
      findManyArgs = args;
      return [
        createSecurityEventFixture({
          createdAt: new Date(),
        }),
      ];
    },
  };

  const response = await listSecurityEvents(
    createRouteRequest(
      "http://localhost/api/users/me/security-events?range=7d",
      {
        headers: {
          cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
        },
      }
    )
  );
  const json = await response.json();
  const afterRequest = Date.now();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  const createdAtFilter = (findManyArgs?.where as Record<string, unknown>).createdAt as
    | { gte?: Date }
    | undefined;
  assert.ok(createdAtFilter?.gte instanceof Date);
  const lowerBound = beforeRequest - 7 * 24 * 60 * 60 * 1000;
  const upperBound = afterRequest - 7 * 24 * 60 * 60 * 1000;
  assert.ok((createdAtFilter.gte?.getTime() ?? 0) >= lowerBound);
  assert.ok((createdAtFilter.gte?.getTime() ?? 0) <= upperBound);
});

test("security events endpoint rejects invalid time range filters", async () => {
  const token = "security-events-invalid-range-token";

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-security-invalid-range-1",
              email: "security-invalid-range@example.com",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
    findMany: async () => {
      throw new Error("should not query when range is invalid");
    },
  };

  const response = await listSecurityEvents(
    createRouteRequest(
      "http://localhost/api/users/me/security-events?range=90d",
      {
        headers: {
          cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
        },
      }
    )
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid time range filter");
});

test("security events endpoint applies page pagination and returns pagination metadata", async () => {
  const token = "security-events-page-token";
  let findManyArgs: Record<string, unknown> | null = null;

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-security-page-1",
              email: "security-page@example.com",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
    findMany: async (args: Record<string, unknown>) => {
      findManyArgs = args;
      return [
        createSecurityEventFixture({ id: "security-event-1" }),
        createSecurityEventFixture({ id: "security-event-2" }),
        createSecurityEventFixture({ id: "security-event-3" }),
      ];
    },
  };

  const response = await listSecurityEvents(
    createRouteRequest(
      "http://localhost/api/users/me/security-events?page=2&limit=2",
      {
        headers: {
          cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
        },
      }
    )
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(findManyArgs?.skip, 2);
  assert.equal(findManyArgs?.take, 3);
  assert.equal(json.data.length, 2);
  assert.equal(json.pagination.page, 2);
  assert.equal(json.pagination.limit, 2);
  assert.equal(json.pagination.hasMore, true);
  assert.equal(json.pagination.nextPage, 3);
});

test("security events endpoint rejects invalid page filters", async () => {
  const token = "security-events-invalid-page-token";

  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-security-invalid-page-1",
              email: "security-invalid-page@example.com",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
    findMany: async () => {
      throw new Error("should not query when page is invalid");
    },
  };

  const response = await listSecurityEvents(
    createRouteRequest(
      "http://localhost/api/users/me/security-events?page=0",
      {
        headers: {
          cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
        },
      }
    )
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid page filter");
});
