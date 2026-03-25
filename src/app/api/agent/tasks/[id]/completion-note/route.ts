import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { PATCH as updateCompletionNotePublic } from "@/app/api/tasks/[id]/completion-note/route";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await updateCompletionNotePublic(request, context);

  return officialAgentResponse(response);
}
