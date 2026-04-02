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
    throw new Error("Product not found");
  }

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
      throw new Error("Insufficient points");
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

    const soldInventory = await tx.secretInventory.update({
      where: { id: inventory.id },
      data: {
        status: "SOLD",
        soldOrderId: order.id,
        soldAt: new Date(),
      },
    });

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
}
