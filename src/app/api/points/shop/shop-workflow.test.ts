import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createAvatarConfigFixture,
  createCatalogProductFixture,
  createSecurityEventFixture,
  createSecretInventoryFixture,
  createShopItemFixture,
} from "@/test/factories";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteRequest } from "@/test/request-helpers";
import { hashApiKey } from "@/lib/auth";
import { encryptSecretValue } from "@/lib/secret-crypto";
import { POST as purchaseItem } from "./purchase/route";
import { PUT as equipItem } from "@/app/api/agents/me/equipment/route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type ShopPrismaMock = {
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
  shopItem: {
    findUnique: AsyncMethod;
  };
  agentInventory: {
    findUnique: AsyncMethod;
    findMany: AsyncMethod;
    create: AsyncMethod;
    update: AsyncMethod;
    updateMany: AsyncMethod;
  };
  pointTransaction: {
    create: AsyncMethod;
  };
  dailyCheckin: {
    findUnique: AsyncMethod;
  };
  catalogProduct?: {
    findUnique: AsyncMethod;
  };
  secretInventory?: {
    findFirst: AsyncMethod;
    update: AsyncMethod;
  };
  purchaseOrder?: {
    create: AsyncMethod;
  };
  secretDeliveryReceipt?: {
    create: AsyncMethod;
  };
  $transaction: (input: unknown) => Promise<unknown>;
};

const prismaClient = prisma as unknown as ShopPrismaMock;

const originalMethods = {
  agentFindUnique: prismaClient.agent.findUnique,
  agentUpdate: prismaClient.agent.update,
  agentUpdateMany: prismaClient.agent.updateMany,
  credentialFindUnique: prismaClient.agentCredential?.findUnique,
  credentialUpdate: prismaClient.agentCredential?.update,
  shopItemFindUnique: prismaClient.shopItem.findUnique,
  inventoryFindUnique: prismaClient.agentInventory.findUnique,
  inventoryFindMany: prismaClient.agentInventory.findMany,
  inventoryCreate: prismaClient.agentInventory.create,
  inventoryUpdate: prismaClient.agentInventory.update,
  inventoryUpdateMany: prismaClient.agentInventory.updateMany,
  pointTransactionCreate: prismaClient.pointTransaction.create,
  dailyCheckinFindUnique: prismaClient.dailyCheckin.findUnique,
  securityEventCreate: prismaClient.securityEvent?.create,
  catalogProductFindUnique: prismaClient.catalogProduct?.findUnique,
  secretInventoryFindFirst: prismaClient.secretInventory?.findFirst,
  secretInventoryUpdate: prismaClient.secretInventory?.update,
  purchaseOrderCreate: prismaClient.purchaseOrder?.create,
  secretDeliveryReceiptCreate: prismaClient.secretDeliveryReceipt?.create,
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
  prismaClient.shopItem.findUnique = originalMethods.shopItemFindUnique;
  prismaClient.agentInventory.findUnique = originalMethods.inventoryFindUnique;
  prismaClient.agentInventory.findMany = originalMethods.inventoryFindMany;
  prismaClient.agentInventory.create = originalMethods.inventoryCreate;
  prismaClient.agentInventory.update = originalMethods.inventoryUpdate;
  prismaClient.agentInventory.updateMany = originalMethods.inventoryUpdateMany;
  prismaClient.pointTransaction.create = originalMethods.pointTransactionCreate;
  prismaClient.dailyCheckin.findUnique = originalMethods.dailyCheckinFindUnique;
  if (prismaClient.securityEvent && originalMethods.securityEventCreate) {
    prismaClient.securityEvent.create = originalMethods.securityEventCreate;
  }
  if (prismaClient.catalogProduct && originalMethods.catalogProductFindUnique) {
    prismaClient.catalogProduct.findUnique =
      originalMethods.catalogProductFindUnique;
  } else {
    prismaClient.catalogProduct = undefined;
  }
  if (prismaClient.secretInventory && originalMethods.secretInventoryFindFirst) {
    prismaClient.secretInventory.findFirst =
      originalMethods.secretInventoryFindFirst;
  }
  if (prismaClient.secretInventory && originalMethods.secretInventoryUpdate) {
    prismaClient.secretInventory.update =
      originalMethods.secretInventoryUpdate;
  } else {
    prismaClient.secretInventory = undefined;
  }
  if (prismaClient.purchaseOrder && originalMethods.purchaseOrderCreate) {
    prismaClient.purchaseOrder.create = originalMethods.purchaseOrderCreate;
  } else {
    prismaClient.purchaseOrder = undefined;
  }
  if (
    prismaClient.secretDeliveryReceipt &&
    originalMethods.secretDeliveryReceiptCreate
  ) {
    prismaClient.secretDeliveryReceipt.create =
      originalMethods.secretDeliveryReceiptCreate;
  } else {
    prismaClient.secretDeliveryReceipt = undefined;
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

test("legacy cosmetic purchase still accepts itemId and creates inventory atomically", async () => {
  let transactionCalls = 0;
  const pointTransactions: Array<Record<string, unknown>> = [];

  mockAgentCredential("agent-key", {
    id: "agent-1",
    points: 120,
    avatarConfig: createAvatarConfigFixture(),
  });
  prismaClient.shopItem.findUnique = async () =>
    createShopItemFixture({
      id: "crown",
      name: "Crown",
    });
  prismaClient.catalogProduct = {
    findUnique: async () => {
      throw new Error("secret product lookup should not run for itemId purchases");
    },
  };
  prismaClient.secretInventory = {
    findFirst: async () => {
      throw new Error("secret inventory lookup should not run for itemId purchases");
    },
    update: async () => {
      throw new Error("secret inventory update should not run for itemId purchases");
    },
  };
  prismaClient.agentInventory.findUnique = async () => null;
  prismaClient.$transaction = async (input) => {
    transactionCalls += 1;

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
        updateMany: async () => ({ count: 1 }),
      },
      agentActivity: {
        create: async () => ({}),
      },
      agentInventory: {
        create: async () => ({
          id: "inventory-1",
          agentId: "agent-1",
          itemId: "crown",
          equipped: false,
          item: {
            id: "crown",
            name: "Crown",
          },
        }),
      },
    });
  };

  const response = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      json: {
        itemId: "crown",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
  assert.equal(transactionCalls, 1);
  assert.equal(pointTransactions.length, 1);
  assert.equal(json.data.item.name, "Crown");
  assert.equal(json.data.item.id, "crown");
});

test("purchase fulfills secret credential products via productId", async () => {
  const previousKey = process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
  process.env.SECRET_INVENTORY_ENCRYPTION_KEY = "test-secret-key";

  try {
    const encrypted = encryptSecretValue("sk-live-abcdef1234");

    mockAgentCredential("agent-key", {
      id: "agent-1",
      points: 120,
      avatarConfig: createAvatarConfigFixture(),
    });

    prismaClient.catalogProduct = {
      findUnique: async () =>
        createCatalogProductFixture({
          id: "product-1",
          name: "Provider Key Pack",
          productType: "SECRET_CREDENTIAL",
          price: 100,
        }),
    };
    prismaClient.secretInventory = {
      findFirst: async () =>
        createSecretInventoryFixture({
          id: "secret-1",
          productId: "product-1",
          encryptedValue: encrypted,
          maskedValue: "sk-****1234",
          status: "AVAILABLE",
        }),
      updateMany: async () => ({ count: 1 }),
      findUnique: async () =>
        createSecretInventoryFixture({
          id: "secret-1",
          productId: "product-1",
          encryptedValue: encrypted,
          maskedValue: "sk-****1234",
          status: "SOLD",
        }),
    };
    prismaClient.purchaseOrder = {
      create: async () => ({ id: "order-1" }),
    };
    prismaClient.secretDeliveryReceipt = {
      create: async () => ({ id: "receipt-1" }),
    };

    prismaClient.$transaction = async (input) => {
      if (typeof input !== "function") {
        throw new Error("Expected transaction callback");
      }

      return input({
        secretInventory: prismaClient.secretInventory,
        purchaseOrder: prismaClient.purchaseOrder,
        secretDeliveryReceipt: prismaClient.secretDeliveryReceipt,
        agent: {
          updateMany: async () => ({ count: 1 }),
        },
        pointTransaction: {
          create: async () => ({ id: "txn-1" }),
        },
        agentActivity: {
          create: async () => ({}),
        },
      });
    };

    const response = await purchaseItem(
      createRouteRequest("http://localhost/api/points/shop/purchase", {
        method: "POST",
        apiKey: "agent-key",
        json: {
          productId: "product-1",
        },
      })
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.data.delivery.type, "secret_credential");
    assert.match(json.data.delivery.secret, /^sk-live-/);
  } finally {
    if (previousKey === undefined) {
      delete process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
    } else {
      process.env.SECRET_INVENTORY_ENCRYPTION_KEY = previousKey;
    }
  }
});

test("purchase returns 404 when the secret product is missing", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    points: 120,
    avatarConfig: createAvatarConfigFixture(),
  });
  prismaClient.catalogProduct = {
    findUnique: async () => null,
  };

  const response = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      json: {
        productId: "missing-product",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.error, "Product not found");
});

test("purchase returns 409 when secret inventory is out of stock", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    points: 120,
    avatarConfig: createAvatarConfigFixture(),
  });

  prismaClient.catalogProduct = {
    findUnique: async () =>
      createCatalogProductFixture({
        id: "product-1",
        name: "Provider Key Pack",
        productType: "SECRET_CREDENTIAL",
        price: 100,
      }),
  };
  prismaClient.secretInventory = {
    findFirst: async () => null,
    updateMany: async () => ({ count: 0 }),
    findUnique: async () => null,
  };

  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      throw new Error("Expected transaction callback");
    }

    return input({
      secretInventory: prismaClient.secretInventory,
      purchaseOrder: prismaClient.purchaseOrder,
      secretDeliveryReceipt: prismaClient.secretDeliveryReceipt,
      agent: {
        updateMany: async () => ({ count: 1 }),
      },
      pointTransaction: {
        create: async () => ({ id: "txn-1" }),
      },
      agentActivity: {
        create: async () => ({}),
      },
    });
  };

  const response = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      json: {
        productId: "product-1",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.success, false);
  assert.equal(json.error, "Product is out of stock");
  assert.equal("data" in json, false);
});

test("purchase rejects credentials missing points:shop scope", async () => {
  let transactionCalls = 0;

  mockAgentCredential(
    "agent-key",
    {
      id: "agent-1",
      points: 120,
      avatarConfig: createAvatarConfigFixture(),
    },
    {
      scopes: ["forum:read"],
    }
  );
  prismaClient.shopItem.findUnique = async () =>
    createShopItemFixture({
      id: "crown",
      name: "Crown",
    });
  prismaClient.agentInventory.findUnique = async () => null;
  prismaClient.$transaction = async function transactionStub() {
    transactionCalls += 1;
    return null;
  };

  const response = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      json: {
        itemId: "crown",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.error, "Forbidden: Missing required scope points:shop");
  assert.equal(transactionCalls, 0);
});

test("purchase returns conflict when the item is already owned", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    points: 120,
    avatarConfig: createAvatarConfigFixture(),
  });
  prismaClient.shopItem.findUnique = async () =>
    createShopItemFixture({
      id: "crown",
      name: "Crown",
    });
  prismaClient.agentInventory.findUnique = async () => ({
    id: "inventory-1",
    itemId: "crown",
    agentId: "agent-1",
  });

  const response = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      json: {
        itemId: "crown",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.error, "Item already owned");
});

test("purchase rejects inactive items", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    points: 120,
    avatarConfig: createAvatarConfigFixture(),
  });
  prismaClient.shopItem.findUnique = async () =>
    createShopItemFixture({
      id: "crown",
      isActive: false,
    });
  prismaClient.agentInventory.findUnique = async () => null;

  const response = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      json: {
        itemId: "crown",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.error, "Shop item not found");
});

test("purchase aborts before inventory creation when the transactional balance guard fails", async () => {
  let inventoryCreateCalls = 0;

  mockAgentCredential("agent-key", {
    id: "agent-1",
    points: 120,
    avatarConfig: createAvatarConfigFixture(),
  });
  prismaClient.shopItem.findUnique = async () =>
    createShopItemFixture({
      id: "crown",
      name: "Crown",
      price: 100,
    });
  prismaClient.agentInventory.findUnique = async () => null;
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      throw new Error("Expected transaction callback");
    }

    return input({
      pointTransaction: {
        create: async () => ({ id: "txn-1" }),
      },
      agent: {
        update: async () => ({ id: "agent-1" }),
        updateMany: async () => ({ count: 0 }),
      },
      agentActivity: {
        create: async () => ({}),
      },
      agentInventory: {
        create: async () => {
          inventoryCreateCalls += 1;
          return {
            id: "inventory-1",
            agentId: "agent-1",
            itemId: "crown",
            equipped: false,
            item: {
              id: "crown",
              name: "Crown",
            },
          };
        },
      },
    });
  };

  const response = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      json: {
        itemId: "crown",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.error, "Insufficient points");
  assert.equal(inventoryCreateCalls, 0);
});

test("purchase hits the abuse limit on repeated writes", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    points: 120,
    avatarConfig: createAvatarConfigFixture(),
  });
  prismaClient.shopItem.findUnique = async ({ where }: { where: { id: string } }) =>
    createShopItemFixture({
      id: where.id,
      name: `Item ${where.id}`,
      price: 10,
    });
  prismaClient.agentInventory.findUnique = async () => null;
  prismaClient.$transaction = async (input) => {
    if (typeof input !== "function") {
      throw new Error("Expected transaction callback");
    }

    return input({
      pointTransaction: {
        create: async () => ({ id: "txn-1" }),
      },
      agent: {
        updateMany: async () => ({ count: 1 }),
      },
      agentActivity: {
        create: async () => ({}),
      },
      agentInventory: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: `inventory-${data.itemId}`,
          agentId: "agent-1",
          itemId: data.itemId,
          equipped: false,
          item: {
            id: data.itemId,
            name: `Item ${data.itemId}`,
          },
        }),
      },
    });
  };

  for (let index = 0; index < 5; index += 1) {
    const response = await purchaseItem(
      createRouteRequest("http://localhost/api/points/shop/purchase", {
        method: "POST",
        apiKey: "agent-key",
        headers: {
          "x-forwarded-for": "198.51.100.60",
        },
        json: {
          itemId: `item-${index}`,
        },
      })
    );

    assert.equal(response.status, 200);
  }

  const blocked = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      headers: {
        "x-forwarded-for": "198.51.100.60",
      },
      json: {
        itemId: "item-blocked",
      },
    })
  );
  const json = await blocked.json();

  assert.equal(blocked.status, 429);
  assert.equal(json.error, "Too many requests");
});

test("equip updates inventory flags and avatarConfig together", async () => {
  let transactionCalls = 0;
  let updateManyArgs: Record<string, unknown> | undefined;
  let agentUpdateArgs: Record<string, unknown> | undefined;

  mockAgentCredential("agent-key", {
    id: "agent-1",
    avatarConfig: createAvatarConfigFixture({
      hat: "tophat",
    }),
  });
  prismaClient.agentInventory.findUnique = async () => ({
    id: "inventory-crown",
    agentId: "agent-1",
    itemId: "crown",
    equipped: false,
    item: {
      id: "crown",
      type: "hat",
      spriteKey: "crown",
      name: "Crown",
    },
  });
  prismaClient.agentInventory.findMany = async () => [
    {
      id: "inventory-crown",
      itemId: "crown",
      item: { type: "hat" },
    },
    {
      id: "inventory-top-hat",
      itemId: "tophat",
      item: { type: "hat" },
    },
  ];
  prismaClient.$transaction = async (input) => {
    transactionCalls += 1;

    if (typeof input !== "function") {
      throw new Error("Expected transaction callback");
    }

    return input({
      agentInventory: {
        updateMany: async (args: Record<string, unknown>) => {
          updateManyArgs = args;
          return { count: 2 };
        },
        update: async () => ({
          id: "inventory-crown",
          equipped: true,
          item: { id: "crown", type: "hat", spriteKey: "crown", name: "Crown" },
        }),
      },
      agent: {
        update: async (args: Record<string, unknown>) => {
          agentUpdateArgs = args;
          return {
            id: "agent-1",
            avatarConfig: {
              color: "red",
              hat: "crown",
              accessory: null,
            },
          };
        },
      },
    });
  };

  const response = await equipItem(
    createRouteRequest("http://localhost/api/agents/me/equipment", {
      method: "PUT",
      apiKey: "agent-key",
      json: {
        itemId: "crown",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(transactionCalls, 1);
  assert.deepEqual(updateManyArgs?.data, { equipped: false });
  assert.deepEqual(agentUpdateArgs?.data, {
    avatarConfig: {
      color: "red",
      hat: "crown",
      accessory: null,
    },
  });
  assert.equal(json.data.avatarConfig.hat, "crown");
});
