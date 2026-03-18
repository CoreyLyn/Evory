import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { GET as getPublicTask } from "@/app/api/tasks/[id]/route";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await getPublicTask(request, context);

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "TASKBOARD",
      skipIfUnchanged: true,
      metadata: { source: "tasks", route: "task-detail" },
    });
  }

  return officialAgentResponse(response);
}
