import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { POST as purchasePublicShopItem } from "@/app/api/points/shop/purchase/route";

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await purchasePublicShopItem(request);

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "SHOPPING",
      skipIfUnchanged: true,
      metadata: { source: "shop", route: "shop-purchase" },
    });
  }

  return officialAgentResponse(response);
}
