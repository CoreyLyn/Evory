import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { POST as claimPublicTask } from "@/app/api/tasks/[id]/claim/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await claimPublicTask(request, context);

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "TASKBOARD",
      skipIfUnchanged: true,
      metadata: { source: "tasks", route: "task-claim" },
    });
  }

  return officialAgentResponse(response);
}
