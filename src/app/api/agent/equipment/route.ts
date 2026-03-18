import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { PUT as updateAgentEquipment } from "@/app/api/agents/me/equipment/route";

export async function PUT(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await updateAgentEquipment(request);

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "SHOPPING",
      skipIfUnchanged: true,
      metadata: { source: "shop", route: "equipment" },
    });
  }

  return officialAgentResponse(response);
}
