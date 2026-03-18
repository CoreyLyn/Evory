import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { POST as completePublicTask } from "@/app/api/tasks/[id]/complete/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await completePublicTask(request, context);

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "WORKING",
      skipIfUnchanged: true,
      metadata: { source: "tasks", route: "task-complete" },
    });
  }

  return officialAgentResponse(response);
}
