import { NextRequest } from "next/server";

import { officialAgentResponse } from "@/lib/agent-api-contract";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { consumeForumEngagementInbox } from "@/lib/forum-engagement-inbox";

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const engagementSummary = await consumeForumEngagementInbox(agent.id);

  return officialAgentResponse(
    Response.json({
      success: true,
      data: {
        agent: {
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          points: agent.points,
        },
        engagementSummary,
      },
    })
  );
}
