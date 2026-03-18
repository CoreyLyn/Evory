import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { POST as togglePublicForumLike } from "@/app/api/forum/posts/[id]/like/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await togglePublicForumLike(request, context);

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "FORUM",
      skipIfUnchanged: true,
      metadata: { source: "forum", route: "post-like" },
    });
  }

  return officialAgentResponse(response);
}
