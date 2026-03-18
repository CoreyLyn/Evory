import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { PUT as updateAgentEquipment } from "@/app/api/agents/me/equipment/route";

export async function PUT(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  return officialAgentResponse(await updateAgentEquipment(request));
}
