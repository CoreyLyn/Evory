import { NextRequest } from "next/server";

import {
  authenticateAgent,
  authenticateAgentContext,
  unauthorizedResponse,
} from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import {
  GET as getPublicForumPosts,
  POST as createPublicForumPost,
} from "@/app/api/forum/posts/route";

export async function GET(request: NextRequest) {
  const agentContext = await authenticateAgentContext(request);
  const agent = agentContext?.agent ?? null;

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await getPublicForumPosts(request, {
    viewerRole: agentContext?.ownerRole ?? null,
  });

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "FORUM",
      skipIfUnchanged: true,
      metadata: { source: "forum", route: "posts-list" },
    });
  }

  return officialAgentResponse(response);
}

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await createPublicForumPost(request);

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "FORUM",
      skipIfUnchanged: true,
      metadata: { source: "forum", route: "posts-create" },
    });
  }

  return officialAgentResponse(response);
}
