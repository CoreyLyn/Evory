import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createSecurityEventFixture,
} from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import { hashApiKey } from "@/lib/auth";

import { GET } from "./route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type AgentOrdersPrismaMock = {
  agent: {
    update: AsyncMethod;
  };
  agentCredential?: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
  agentActivity?: {
    create: AsyncMethod;
  };
  dailyCheckin: {
    findUnique: AsyncMethod;
  };
  securityEvent?: {
    create: AsyncMethod;
  };
  purchaseOrder?: {
    findMany: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as AgentOrdersPrismaMock;
const originalAgentUpdate = prismaClient.agent.update;
const originalCredentialFindUnique = prismaClient.agentCredential?.findUnique;
const originalCredentialUpdate = prismaClient.agentCredential?.update;
const originalAgentActivityCreate = prismaClient.agentActivity?.create;
const originalDailyCheckinFindUnique = prismaClient.dailyCheckin.findUnique;
const originalSecurityEventCreate = prismaClient.securityEvent?.create;
const originalPurchaseOrderFindMany = prismaClient.purchaseOrder?.findMany;

function mockAgentCredential(apiKey: string, agentOverrides: Record<string, unknown> = {}) {
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
            agent: createAgentFixture({
              apiKey,
              ...agentOverrides,
            }),
          })
        : null,
    update: async () => createAgentCredentialFixture(),
  };
}

beforeEach(() => {
  prismaClient.agentActivity = {
    create: async () => ({ id: "activity-1" }),
  };
  prismaClient.dailyCheckin.findUnique = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
  };
});

afterEach(() => {
  prismaClient.agent.update = originalAgentUpdate;
  if (prismaClient.agentCredential && originalCredentialFindUnique) {
    prismaClient.agentCredential.findUnique = originalCredentialFindUnique;
  }
  if (prismaClient.agentCredential && originalCredentialUpdate) {
    prismaClient.agentCredential.update = originalCredentialUpdate;
  }
  if (prismaClient.agentActivity && originalAgentActivityCreate) {
    prismaClient.agentActivity.create = originalAgentActivityCreate;
  }
  prismaClient.dailyCheckin.findUnique = originalDailyCheckinFindUnique;
  if (prismaClient.securityEvent && originalSecurityEventCreate) {
    prismaClient.securityEvent.create = originalSecurityEventCreate;
  }
  if (prismaClient.purchaseOrder && originalPurchaseOrderFindMany) {
    prismaClient.purchaseOrder.findMany = originalPurchaseOrderFindMany;
  } else {
    prismaClient.purchaseOrder = undefined;
  }
});

test("GET /api/agent/shop/orders returns masked order history for the authenticated buyer", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });

  let receivedArgs: unknown = null;
  prismaClient.purchaseOrder = {
    findMany: async (args: unknown) => {
      receivedArgs = args;

      return [
        {
          id: "order-1",
          status: "FULFILLED",
          pricePaid: 300,
          currencyType: "POINTS",
          deliveryChannel: "AGENT_CHAT",
          failureReason: null,
          quotaAmount: 10000,
          quotaUnitLabel: "tokens",
          createdAt: new Date("2026-04-07T10:00:00.000Z"),
          confirmedAt: new Date("2026-04-07T10:01:00.000Z"),
          fulfilledAt: new Date("2026-04-07T10:01:00.000Z"),
          product: {
            id: "product-1",
            name: "Provider Pack",
            isActive: true,
          },
          providedApiKey: {
            id: "key-1",
            label: "Primary OpenAI key",
            maskedKey: "sk-****1234",
            providerLabel: "OpenAI",
          },
        },
      ];
    },
  };

  const response = await GET(
    createRouteRequest(
      "http://localhost/api/agent/shop/orders?productId=product-1&status=FULFILLED",
      { apiKey: "agent-key" }
    )
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(receivedArgs, {
    where: {
      buyerAgentId: "agent-1",
      productId: "product-1",
      status: "FULFILLED",
      product: {
        productType: "API_QUOTA",
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      pricePaid: true,
      currencyType: true,
      deliveryChannel: true,
      failureReason: true,
      quotaAmount: true,
      quotaUnitLabel: true,
      createdAt: true,
      confirmedAt: true,
      fulfilledAt: true,
      product: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
      providedApiKey: {
        select: {
          id: true,
          label: true,
          maskedKey: true,
          providerLabel: true,
        },
      },
    },
  });
  assert.deepEqual(json.data, [
    {
      id: "order-1",
      status: "FULFILLED",
      pricePaid: 300,
      currencyType: "POINTS",
      deliveryChannel: "AGENT_CHAT",
      failureReason: null,
      quota: {
        amount: 10000,
        unit: "tokens",
      },
      createdAt: "2026-04-07T10:00:00.000Z",
      confirmedAt: "2026-04-07T10:01:00.000Z",
      fulfilledAt: "2026-04-07T10:01:00.000Z",
      product: {
        id: "product-1",
        name: "Provider Pack",
        isActive: true,
      },
      providedApiKey: {
        id: "key-1",
        label: "Primary OpenAI key",
        maskedKey: "sk-****1234",
        providerLabel: "OpenAI",
      },
    },
  ]);
  assert.equal("buyer" in json.data[0], false);
  assert.equal("delivery" in json.data[0], false);
});

test("GET /api/agent/shop/orders rejects invalid status filters", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });

  const response = await GET(
    createRouteRequest("http://localhost/api/agent/shop/orders?status=UNKNOWN", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(json, {
    success: false,
    error: "Invalid order status",
  });
});
