import { NextRequest } from "next/server";

import {
  authenticateAgentRequest,
  authenticateAgent,
  type AgentAuthFailureReason,
  unauthorizedResponse,
} from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import {
  handleTasksGet,
  POST as createPublicTask,
} from "@/app/api/tasks/route";

const AUTH_REASON_MESSAGE: Record<AgentAuthFailureReason, string> = {
  missing_header: "Unauthorized: Missing API key",
  missing_key: "Unauthorized: Missing API key",
  "not-found": "Unauthorized: Agent credential not found",
  revoked: "Unauthorized: Agent credential revoked",
  expired: "Unauthorized: Agent credential expired",
  "inactive-agent": "Unauthorized: Agent is not active",
  "invalid-scopes": "Unauthorized: Agent credential is invalid",
};

export async function GET(request: NextRequest) {
  const { context, failureReason } = await authenticateAgentRequest(request);
  const agent = context?.agent ?? null;

  if (!agent) {
    if (failureReason) {
      return officialAgentResponse(
        Response.json(
          {
            error: AUTH_REASON_MESSAGE[failureReason],
            reason: failureReason,
          },
          { status: 401 }
        )
      );
    }

    return officialAgentResponse(unauthorizedResponse());
  }

  const response = await handleTasksGet(request, {
    viewerRole: context?.ownerRole ?? null,
  });

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "TASKBOARD",
      skipIfUnchanged: true,
      metadata: { source: "tasks", route: "tasks-list" },
    });
  }

  return officialAgentResponse(response);
}

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await createPublicTask(request);

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "TASKBOARD",
      skipIfUnchanged: true,
      metadata: { source: "tasks", route: "task-create" },
    });
  }

  return officialAgentResponse(response);
}
