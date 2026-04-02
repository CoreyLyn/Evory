import { PointActionType } from "@/generated/prisma/client";

import { decryptSecretValue } from "@/lib/secret-crypto";
import { deductPoints } from "@/lib/points";
import prisma from "@/lib/prisma";

export class OutOfStockError extends Error {
  constructor() {
    super("Product is out of stock");
    this.name = "OutOfStockError";
  }
}

export class ProductNotFoundError extends Error {
  constructor() {
    super("Product not found");
    this.name = "ProductNotFoundError";
  }
}

export class InsufficientPointsError extends Error {
  constructor() {
    super("Insufficient points");
    this.name = "InsufficientPointsError";
  }
}

class InventoryClaimConflictError extends Error {
  constructor() {
    super("Inventory claim conflict");
    this.name = "InventoryClaimConflictError";
  }
}

const MAX_INVENTORY_CLAIM_ATTEMPTS = 5;

export async function fulfillSecretCredentialPurchase({
  agentId,
  productId,
  prisma: db = prisma,
}: {
  agentId: string;
  productId: string;
  prisma?: typeof prisma;
}) {
  const product = await db.catalogProduct.findUnique({
    where: { id: productId },
  });

  if (!product || !product.isActive || product.productType !== "SECRET_CREDENTIAL") {
    throw new ProductNotFoundError();
  }

  for (let attempt = 0; attempt < MAX_INVENTORY_CLAIM_ATTEMPTS; attempt += 1) {
    try {
      const result = await db.$transaction(async (tx) => {
        const inventory = await tx.secretInventory.findFirst({
          where: { productId, status: "AVAILABLE" },
          orderBy: { createdAt: "asc" },
        });

        if (!inventory) {
          throw new OutOfStockError();
        }

        const deducted = await deductPoints(
          agentId,
          product.price,
          PointActionType.SHOP_PURCHASE,
          product.id,
          `Purchased: ${product.name}`,
          tx
        );

        if (!deducted) {
          throw new InsufficientPointsError();
        }

        const order = await tx.purchaseOrder.create({
          data: {
            buyerAgentId: agentId,
            productId: product.id,
            pricePaid: product.price,
            currencyType: product.currencyType,
            status: "FULFILLED",
            deliveryChannel: "AGENT_CHAT",
            fulfilledAt: new Date(),
          },
        });

        const soldAt = new Date();
        const claim = await tx.secretInventory.updateMany({
          where: {
            id: inventory.id,
            status: "AVAILABLE",
          },
          data: {
            status: "SOLD",
            soldOrderId: order.id,
            soldAt,
          },
        });

        if (claim.count !== 1) {
          throw new InventoryClaimConflictError();
        }

        const soldInventory = await tx.secretInventory.findUnique({
          where: { id: inventory.id },
        });

        if (!soldInventory) {
          throw new Error("Sold inventory not found");
        }

        await tx.secretDeliveryReceipt.create({
          data: {
            orderId: order.id,
            secretInventoryId: soldInventory.id,
            buyerAgentId: agentId,
          },
        });

        return { order, inventory: soldInventory };
      });

      return {
        orderId: result.order.id,
        product: {
          id: product.id,
          name: product.name,
        },
        delivery: {
          type: "secret_credential" as const,
          secret: decryptSecretValue(result.inventory.encryptedValue),
          masked: result.inventory.maskedValue,
          displayInstruction:
            "This credential is returned only in this purchase response. Store it securely.",
        },
      };
    } catch (error) {
      if (error instanceof InventoryClaimConflictError) {
        continue;
      }

      throw error;
    }
  }

  throw new OutOfStockError();
}
