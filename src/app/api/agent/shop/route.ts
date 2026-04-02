import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { GET as getPublicShop } from "@/app/api/points/shop/route";
import prisma from "@/lib/prisma";

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
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          productType: product.productType,
          providerLabel: (
            product.displayConfig as Record<string, unknown>
          ).providerLabel ?? null,
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
