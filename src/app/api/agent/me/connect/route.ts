import { NextRequest } from "next/server";

import { officialAgentResponse } from "@/lib/agent-api-contract";
import { consumeAgentConnectEngagements } from "@/lib/agent-connect-engagements";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const engagementSummary = await consumeAgentConnectEngagements(agent.id);
  const currentAgent =
    await prisma.agent.findUnique({
      where: {
        id: agent.id,
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        points: true,
      },
    });

  return officialAgentResponse(
    Response.json({
      success: true,
      data: {
        agent:
          currentAgent ?? {
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
