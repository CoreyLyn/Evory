import { Prisma, PointActionType } from "@/generated/prisma/client";

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

export class PurchaseLimitExceededError extends Error {
  constructor() {
    super("Product purchase limit reached");
    this.name = "PurchaseLimitExceededError";
  }
}

// Retryable error when serializable transaction conflicts are exhausted.
export const SECRET_PURCHASE_RETRYABLE_CONFLICT_CODE =
  "secret_purchase_retryable_conflict";

export class FulfillmentConflictError extends Error {
  readonly code = SECRET_PURCHASE_RETRYABLE_CONFLICT_CODE;

  constructor() {
    super("Secret purchase temporarily unavailable due to contention. Please retry.");
    this.name = "FulfillmentConflictError";
  }
}

class InventoryClaimConflictError extends Error {
  constructor() {
    super("Inventory claim conflict");
    this.name = "InventoryClaimConflictError";
  }
}

const MAX_INVENTORY_CLAIM_ATTEMPTS = 5;

function isRetryableTransactionConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}

function readFulfillmentRules(displayValue: unknown, fulfillmentValue: unknown) {
  const display =
    displayValue && typeof displayValue === "object" && !Array.isArray(displayValue)
      ? (displayValue as Record<string, unknown>)
      : null;
  const config =
    fulfillmentValue && typeof fulfillmentValue === "object" && !Array.isArray(fulfillmentValue)
      ? (fulfillmentValue as Record<string, unknown>)
      : null;

  const allowRepeatPurchase =
    typeof config?.allowRepeatPurchase === "boolean"
      ? config.allowRepeatPurchase
      : true;
  const quotaAmount =
    typeof config?.quotaAmount === "number" &&
    Number.isInteger(config.quotaAmount) &&
    config.quotaAmount > 0
      ? config.quotaAmount
      : null;
  if (!quotaAmount) {
    throw new Error("Invalid API quota product configuration");
  }
  const perAgentPurchaseLimit =
    typeof config?.perAgentPurchaseLimit === "number" &&
    Number.isInteger(config.perAgentPurchaseLimit) &&
    config.perAgentPurchaseLimit > 0
      ? config.perAgentPurchaseLimit
      : null;

  return {
    allowRepeatPurchase,
    quotaAmount,
    quotaUnitLabel:
      typeof display?.quotaUnitLabel === "string" && display.quotaUnitLabel.trim()
        ? display.quotaUnitLabel.trim()
        : "tokens",
    perAgentPurchaseLimit,
  };
}

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

  if (!product || !product.isActive || product.productType !== "API_QUOTA") {
    throw new ProductNotFoundError();
  }

  const fulfillmentRules = readFulfillmentRules(
    product.displayConfig,
    product.fulfillmentConfig
  );
  let sawTransactionConflict = false;
  let sawInventoryClaimConflict = false;

  for (let attempt = 0; attempt < MAX_INVENTORY_CLAIM_ATTEMPTS; attempt += 1) {
    try {
      const result = await db.$transaction(
        async (tx) => {
          const fulfilledPurchaseCount =
            typeof tx.purchaseOrder?.count === "function"
              ? await tx.purchaseOrder.count({
                  where: {
                    buyerAgentId: agentId,
                    productId: product.id,
                    status: "FULFILLED",
                  },
                })
              : 0;

          if (!fulfillmentRules.allowRepeatPurchase && fulfilledPurchaseCount >= 1) {
            throw new PurchaseLimitExceededError();
          }

          if (
            fulfillmentRules.perAgentPurchaseLimit !== null &&
            fulfilledPurchaseCount >= fulfillmentRules.perAgentPurchaseLimit
          ) {
            throw new PurchaseLimitExceededError();
          }

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
              quotaAmount: fulfillmentRules.quotaAmount,
              quotaUnitLabel: fulfillmentRules.quotaUnitLabel,
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

          const secret = decryptSecretValue(soldInventory.encryptedValue);

          await tx.secretDeliveryReceipt.create({
            data: {
              orderId: order.id,
              secretInventoryId: soldInventory.id,
              buyerAgentId: agentId,
            },
          });

          return { order, inventory: soldInventory, secret };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      );

      return {
        orderId: result.order.id,
        product: {
          id: product.id,
          name: product.name,
        },
        delivery: {
          type: "secret_credential" as const,
          secret: result.secret,
          masked: result.inventory.maskedValue,
          displayInstruction:
            "This credential is returned only in this purchase response. Store it securely.",
        },
      };
    } catch (error) {
      if (error instanceof InventoryClaimConflictError) {
        sawInventoryClaimConflict = true;
        continue;
      }

      if (isRetryableTransactionConflict(error)) {
        sawTransactionConflict = true;
        continue;
      }

      throw error;
    }
  }

  if (sawTransactionConflict || sawInventoryClaimConflict) {
    throw new FulfillmentConflictError();
  }

  throw new OutOfStockError();
}
