import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentFixture,
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";
import { GET as getAgentList } from "./list/route";
import { GET as getLeaderboard } from "./leaderboard/route";

type AgentListRecord = {
  id: string;
  name: string;
  type: string;
  status: string;
  points: number;
  avatarConfig?: Record<string, unknown>;
  bio?: string;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

type PublicAgentsPrismaMock = {
  siteConfig?: {
    findFirst: (args?: unknown) => Promise<unknown>;
  };
  userSession?: {
    findUnique: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  agent: {
    findMany: (args: unknown) => Promise<AgentListRecord[]>;
    count: (args: unknown) => Promise<number>;
  };
};

const prismaClient = prisma as unknown as PublicAgentsPrismaMock;
const originalSiteConfig = prismaClient.siteConfig;
const originalUserSession = prismaClient.userSession;
const originalFindMany = prismaClient.agent.findMany;
const originalCount = prismaClient.agent.count;

afterEach(() => {
  prismaClient.siteConfig = originalSiteConfig;
  prismaClient.userSession = originalUserSession;
  prismaClient.agent.findMany = originalFindMany;
  prismaClient.agent.count = originalCount;
});

test("public agents list filters to active non-revoked agents", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  let capturedWhere: Record<string, unknown> | null = null;

  prismaClient.agent.findMany = async ({ where }: { where: Record<string, unknown> }) => {
    capturedWhere = where;
    return [
      createAgentFixture({
        id: "agent-active",
        name: "Active Agent",
        claimStatus: "ACTIVE",
        revokedAt: null,
      }),
    ];
  };
  prismaClient.agent.count = async () => 1;

  const response = await getAgentList(
    createRouteRequest("http://localhost/api/agents/list?pageSize=20")
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(capturedWhere?.claimStatus, "ACTIVE");
  assert.equal(capturedWhere?.revokedAt, null);
  assert.equal(json.data.agents.length, 1);
  assert.equal(json.data.agents[0].id, "agent-active");
});

test("public leaderboard filters to active non-revoked agents", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  let capturedWhere: Record<string, unknown> | null = null;

  prismaClient.agent.findMany = async ({ where }: { where: Record<string, unknown> }) => {
    capturedWhere = where;
    return [
      createAgentFixture({
        id: "agent-active",
        name: "Active Agent",
        claimStatus: "ACTIVE",
        revokedAt: null,
      }),
    ];
  };

  const response = await getLeaderboard();
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(capturedWhere?.claimStatus, "ACTIVE");
  assert.equal(capturedWhere?.revokedAt, null);
  assert.equal(json.data.length, 1);
  assert.equal(json.data[0].id, "agent-active");
});

test("public agents list returns owner display data only when enabled", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  prismaClient.agent.findMany = async () => [
    createAgentFixture({
      id: "agent-visible",
      showOwnerInPublic: true,
      owner: createUserFixture({
        id: "user-visible",
        name: "Visible Owner",
        email: "visible@example.com",
      }),
    }),
    createAgentFixture({
      id: "agent-hidden",
      showOwnerInPublic: false,
      owner: createUserFixture({
        id: "user-hidden",
        name: "Hidden Owner",
        email: "hidden@example.com",
      }),
    }),
  ];
  prismaClient.agent.count = async () => 2;

  const response = await getAgentList(
    createRouteRequest("http://localhost/api/agents/list?pageSize=20")
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(json.data.agents[0].owner, {
    id: "user-visible",
    displayName: "Visible Owner",
  });
  assert.equal(json.data.agents[1].owner, null);
});

test("public agents list masks deleted placeholder agent names", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  prismaClient.agent.findMany = async () => [
    createAgentFixture({
      id: "agent-deleted",
      name: "deleted-agent-agent-deleted",
      isDeletedPlaceholder: true,
      claimStatus: "REVOKED",
      revokedAt: "2026-03-20T00:00:00.000Z",
    }),
  ];
  prismaClient.agent.count = async () => 1;

  const response = await getAgentList(
    createRouteRequest("http://localhost/api/agents/list?pageSize=20")
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.agents[0].name, "已删除 Agent");
});

test("public agents list returns 403 when public content is disabled", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => ({
      id: "site-config-singleton",
      registrationEnabled: true,
      publicContentEnabled: false,
    }),
  };

  const response = await getAgentList(
    createRouteRequest("http://localhost/api/agents/list?pageSize=20")
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.code, "PUBLIC_CONTENT_DISABLED");
});

test("public agents list still allows admins when public content is disabled", async () => {
  const adminToken = "admin-session-token";

  prismaClient.siteConfig = {
    findFirst: async () => ({
      id: "site-config-singleton",
      registrationEnabled: true,
      publicContentEnabled: false,
    }),
  };
  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(adminToken)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({ id: "admin-1", role: "ADMIN" }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
  prismaClient.agent.findMany = async () => [
    createAgentFixture({
      id: "agent-active",
      name: "Active Agent",
      claimStatus: "ACTIVE",
      revokedAt: null,
    }),
  ];
  prismaClient.agent.count = async () => 1;

  const response = await getAgentList(
    createRouteRequest("http://localhost/api/agents/list?pageSize=20", {
      headers: {
        cookie: `evory_user_session=${adminToken}`,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.agents.length, 1);
  assert.equal(json.data.agents[0].id, "agent-active");
});
