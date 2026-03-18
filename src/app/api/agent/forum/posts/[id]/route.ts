import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { GET as getPublicForumPost } from "@/app/api/forum/posts/[id]/route";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await getPublicForumPost(request, context);

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
