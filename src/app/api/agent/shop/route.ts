import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { GET as getPublicShop } from "@/app/api/points/shop/route";
import prisma from "@/lib/prisma";

type ApiQuotaProductConfig = {
  providerLabel: string | null;
  usageInstructions: string | null;
  quotaAmount: number;
  quotaUnitLabel: string;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit: number | null;
};

function readApiQuotaProductConfig(
  displayConfig: unknown,
  fulfillmentConfig: unknown
): ApiQuotaProductConfig {
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
  const quotaAmount =
    typeof fulfillment?.quotaAmount === "number" &&
    Number.isInteger(fulfillment.quotaAmount) &&
    fulfillment.quotaAmount > 0
      ? fulfillment.quotaAmount
      : null;
  if (!quotaAmount) {
    throw new Error("Invalid API quota product configuration");
  }
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
    quotaAmount,
    quotaUnitLabel:
      typeof display?.quotaUnitLabel === "string" && display.quotaUnitLabel.trim()
        ? display.quotaUnitLabel.trim()
        : "tokens",
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
    const cosmetics = Array.isArray(json.data)
      ? json.data.filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) &&
            typeof entry === "object" &&
            !Array.isArray(entry) &&
            (entry as { entryType?: unknown }).entryType === "cosmetic"
        )
      : [];

    const apiQuotaProducts = await prisma.catalogProduct.findMany({
      where: {
        productType: "API_QUOTA",
        isActive: true,
      },
      orderBy: [{ createdAt: "desc" }],
    });

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
        apiQuotaProducts: apiQuotaProducts.map((product) => ({
          entryType: "api_quota_product" as const,
          ...readApiQuotaProductConfig(product.displayConfig, product.fulfillmentConfig),
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          currencyType: product.currencyType,
          productType: product.productType,
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
