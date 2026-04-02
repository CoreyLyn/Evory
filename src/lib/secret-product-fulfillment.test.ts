import assert from "node:assert/strict";
import test from "node:test";

import { encryptSecretValue } from "@/lib/secret-crypto";
import {
  createCatalogProductFixture,
  createSecretInventoryFixture,
} from "@/test/factories";
import { fulfillSecretCredentialPurchase } from "./secret-product-fulfillment";

test("fulfillSecretCredentialPurchase marks inventory sold and returns the decrypted secret", async () => {
  const previousKey = process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
  process.env.SECRET_INVENTORY_ENCRYPTION_KEY = "test-secret-key";

  try {
    const encrypted = encryptSecretValue("sk-live-abcdef1234");
    const product = createCatalogProductFixture({
      id: "product-1",
      name: "Provider Key Pack",
      price: 200,
      productType: "SECRET_CREDENTIAL",
      isActive: true,
    });
    const inventory = createSecretInventoryFixture({
      id: "secret-1",
      productId: "product-1",
      encryptedValue: encrypted,
      maskedValue: "sk-****1234",
      status: "AVAILABLE",
    });

    let updateArgs: Record<string, unknown> | undefined;
    let orderArgs: Record<string, unknown> | undefined;
    let receiptArgs: Record<string, unknown> | undefined;

    const prismaMock = {
      catalogProduct: {
        findUnique: async () => product,
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          secretInventory: {
            findFirst: async () => inventory,
            update: async (args: Record<string, unknown>) => {
              updateArgs = args;
              const data = args.data as Record<string, unknown>;
              return {
                ...inventory,
                ...data,
              };
            },
          },
          purchaseOrder: {
            create: async (args: Record<string, unknown>) => {
              orderArgs = args;
              return { id: "order-1", ...(args.data as Record<string, unknown>) };
            },
          },
          secretDeliveryReceipt: {
            create: async (args: Record<string, unknown>) => {
              receiptArgs = args;
              return { id: "receipt-1", ...(args.data as Record<string, unknown>) };
            },
          },
          agent: {
            updateMany: async () => ({ count: 1 }),
          },
          pointTransaction: {
            create: async () => ({ id: "txn-1" }),
          },
          agentActivity: {
            create: async () => ({ id: "activity-1" }),
          },
        }),
    };

    const result = await fulfillSecretCredentialPurchase({
      agentId: "agent-1",
      productId: "product-1",
      prisma: prismaMock as never,
    });

    assert.equal(result.delivery.type, "secret_credential");
    assert.equal(result.delivery.secret, "sk-live-abcdef1234");
    assert.equal((updateArgs?.data as { status?: string })?.status, "SOLD");
    assert.equal((orderArgs?.data as { buyerAgentId?: string })?.buyerAgentId, "agent-1");
    assert.equal(
      (receiptArgs?.data as { secretInventoryId?: string })?.secretInventoryId,
      "secret-1"
    );
  } finally {
    if (previousKey === undefined) {
      delete process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
    } else {
      process.env.SECRET_INVENTORY_ENCRYPTION_KEY = previousKey;
    }
  }
});
