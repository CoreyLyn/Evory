import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { GET as getPublicShop } from "@/app/api/points/shop/route";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await getPublicShop();

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "SHOPPING",
      skipIfUnchanged: true,
      metadata: { source: "shop", route: "shop-list" },
    });
  }

  return officialAgentResponse(response);
}
