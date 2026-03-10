import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { hashApiKey } from "@/lib/auth";
import { USER_SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/user-auth";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import { POST as claimAgent } from "./claim/route";
import { POST as registerAgent } from "./register/route";
import { GET as listOwnedAgents } from "../users/me/agents/route";
import { GET as getOwnedAgent } from "../users/me/agents/[id]/route";
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
const originalUserSessionFindUnique = prismaClient.userSession?.findUnique;
const originalUserSessionDeleteMany = prismaClient.userSession?.deleteMany;

afterEach(() => {
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
  if (prismaClient.userSession && originalUserSessionFindUnique) {
    prismaClient.userSession.findUnique = originalUserSessionFindUnique;
  }
  if (prismaClient.userSession && originalUserSessionDeleteMany) {
    prismaClient.userSession.deleteMany = originalUserSessionDeleteMany;
  }
});

test("register creates an unclaimed agent and returns its raw api key", async () => {
  let createdCredentialHash = "";

  prismaClient.agent.findUnique = async ({ where }: { where: { name?: string; apiKey?: string } }) =>
    where.name === "New Agent" || where.apiKey ? null : null;
  prismaClient.agent.create = async ({ data }: { data: Record<string, unknown> }) =>
    createAgentFixture({
      id: "agent-1",
      name: data.name,
      type: data.type,
      apiKey: data.apiKey,
      ownerUserId: null,
      claimStatus: "UNCLAIMED",
      claimedAt: null,
      status: "OFFLINE",
      points: 0,
    });
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
    if (where.id === "agent-1") {
      return createAgentFixture({
        id: "agent-1",
        ownerUserId: "user-1",
        claimStatus: "ACTIVE",
      });
    }

    return null;
  };
  prismaClient.agent.update = async () =>
    createAgentFixture({
      id: "agent-1",
      ownerUserId: "user-1",
      claimStatus: "ACTIVE",
    });
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
