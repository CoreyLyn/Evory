import { NextRequest } from "next/server";

import { authenticateAgentContext, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { handleForumPostDetailGet } from "@/app/api/forum/posts/[id]/route";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agentContext = await authenticateAgentContext(request);
  const agent = agentContext?.agent ?? null;

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await handleForumPostDetailGet(request, context, {
    viewerRole: agentContext?.ownerRole ?? null,
  });

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "FORUM",
      skipIfUnchanged: true,
      metadata: { source: "forum", route: "post-detail" },
    });
  }

  return officialAgentResponse(response);
}
