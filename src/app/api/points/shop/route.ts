import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";

type SecretProductConfig = {
  providerLabel: string | null;
  usageInstructions: string | null;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit: number | null;
};

function readSecretProductConfig(
  displayConfig: unknown,
  fulfillmentConfig: unknown
): SecretProductConfig {
  const display =
    displayConfig && typeof displayConfig === "object" && !Array.isArray(displayConfig)
      ? (displayConfig as Record<string, unknown>)
      : null;
  const fulfillment =
    fulfillmentConfig && typeof fulfillmentConfig === "object" && !Array.isArray(fulfillmentConfig)
      ? (fulfillmentConfig as Record<string, unknown>)
      : null;

  const allowRepeatPurchase =
    typeof fulfillment?.allowRepeatPurchase === "boolean"
      ? fulfillment.allowRepeatPurchase
      : true;
  const perAgentPurchaseLimit =
    typeof fulfillment?.perAgentPurchaseLimit === "number" &&
    Number.isInteger(fulfillment.perAgentPurchaseLimit) &&
    fulfillment.perAgentPurchaseLimit > 0
      ? fulfillment.perAgentPurchaseLimit
      : null;

  return {
    providerLabel:
      typeof display?.providerLabel === "string" ? display.providerLabel : null,
    usageInstructions:
      typeof display?.usageInstructions === "string"
        ? display.usageInstructions
        : null,
    allowRepeatPurchase,
    perAgentPurchaseLimit,
  };
}

export async function GET() {
  try {
    const cosmetics = await prisma.shopItem.findMany({
      where: {
        isActive: true,
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    const secretProducts = await prisma.catalogProduct.findMany({
      where: {
        productType: "SECRET_CREDENTIAL",
        isActive: true,
      },
      orderBy: [{ createdAt: "desc" }],
    });
    const secretProductIds = secretProducts.map((product) => product.id);
    const secretInventoryCounts = secretProductIds.length
      ? await prisma.secretInventory.groupBy({
          by: ["productId"],
          where: {
            productId: { in: secretProductIds },
            status: "AVAILABLE",
          },
          _count: { _all: true },
        })
      : [];
    const secretInventoryCountByProductId = new Map(
      secretInventoryCounts.map((row) => [row.productId, row._count._all])
    );

    return notForAgentsResponse(Response.json({
      success: true,
      data: [
        ...cosmetics.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          type: item.type,
          category: item.category,
          spriteKey: item.spriteKey,
          isActive: item.isActive,
          entryType: "cosmetic" as const,
        })),
        ...secretProducts.map((product) => {
          const availableInventoryCount =
            secretInventoryCountByProductId.get(product.id) ?? 0;

          return {
            entryType: "secret_product" as const,
            ...readSecretProductConfig(product.displayConfig, product.fulfillmentConfig),
            id: product.id,
            name: product.name,
            description: product.description,
            price: product.price,
            productType: product.productType,
            availableInventoryCount,
            isInStock: availableInventoryCount > 0,
          };
        }),
      ],
    }));
  } catch (err) {
    console.error("[points/shop GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
