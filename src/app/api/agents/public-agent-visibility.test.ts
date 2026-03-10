import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createAgentFixture } from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
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
  agent: {
    findMany: (args: unknown) => Promise<AgentListRecord[]>;
    count: (args: unknown) => Promise<number>;
  };
};

const prismaClient = prisma as unknown as PublicAgentsPrismaMock;
const originalFindMany = prismaClient.agent.findMany;
const originalCount = prismaClient.agent.count;

afterEach(() => {
  prismaClient.agent.findMany = originalFindMany;
  prismaClient.agent.count = originalCount;
});

test("public agents list filters to active non-revoked agents", async () => {
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
