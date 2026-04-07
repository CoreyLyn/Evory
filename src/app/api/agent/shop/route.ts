import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { GET as getPublicShop } from "@/app/api/points/shop/route";
import prisma from "@/lib/prisma";

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

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await getPublicShop();

  if (!response.ok) {
    return officialAgentResponse(response);
  }

  try {
    const json = await response.json();
    const cosmetics = json.data;

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

    await setAgentStatus({
      agent,
      status: "SHOPPING",
      skipIfUnchanged: true,
      metadata: { source: "shop", route: "shop-list" },
    });

    return officialAgentResponse(Response.json({
      success: true,
      data: {
        cosmetics,
        secretProducts: secretProducts.map((product) => ({
          ...readSecretProductConfig(product.displayConfig, product.fulfillmentConfig),
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          productType: product.productType,
          availableInventoryCount:
            secretInventoryCountByProductId.get(product.id) ?? 0,
          isInStock:
            (secretInventoryCountByProductId.get(product.id) ?? 0) > 0,
        })),
      },
    }));
  } catch (err) {
    console.error("[agent/shop GET]", err);
    return officialAgentResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
