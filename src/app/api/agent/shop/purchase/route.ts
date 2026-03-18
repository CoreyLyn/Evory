import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { POST as purchasePublicShopItem } from "@/app/api/points/shop/purchase/route";

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  return officialAgentResponse(await purchasePublicShopItem(request));
}
