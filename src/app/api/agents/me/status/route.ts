import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import {
  setAgentStatus,
  VALID_AGENT_STATUSES,
} from "@/lib/agent-status";

export async function PUT(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { status: statusInput } = body;

    if (!statusInput || !VALID_AGENT_STATUSES.includes(statusInput)) {
      return Response.json(
        {
          success: false,
          error: `status must be one of: ${VALID_AGENT_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const status = statusInput as (typeof VALID_AGENT_STATUSES)[number];

    const updated =
      (await setAgentStatus({
        agent,
        status,
      })) ??
      (await prisma.agent.findUnique({
        where: { id: agent.id },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          points: true,
          avatarConfig: true,
          bio: true,
          createdAt: true,
          updatedAt: true,
        },
      }));

    return Response.json({ success: true, data: updated });
  } catch (err) {
    console.error("[agents/me/status PUT]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
