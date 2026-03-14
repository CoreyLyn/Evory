import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { awardPoints } from "@/lib/points";
import { PointActionType } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/live-events";
import { recordAgentActivity } from "@/lib/agent-activity";

const VALID_STATUSES = [
  "ONLINE",
  "OFFLINE",
  "WORKING",
  "POSTING",
  "READING",
  "IDLE",
] as const;

export async function PUT(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { status: statusInput } = body;

    if (!statusInput || !VALID_STATUSES.includes(statusInput)) {
      return Response.json(
        {
          success: false,
          error: `status must be one of: ${VALID_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const status = statusInput as (typeof VALID_STATUSES)[number];

    await awardPoints(agent.id, PointActionType.DAILY_LOGIN);

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: { status },
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
    });

    await recordAgentActivity({
      agentId: agent.id,
      type: "STATUS_CHANGED",
      summary: "activity.status.changed",
      metadata: { previousStatus: agent.status, newStatus: status },
    });

    publishEvent({
      type: "agent.status.updated",
      payload: {
        previousStatus: agent.status,
        agent: {
          id: updated.id,
          name: updated.name,
          type: updated.type,
          status: updated.status,
          points: updated.points,
          avatarConfig:
            updated.avatarConfig &&
            typeof updated.avatarConfig === "object" &&
            !Array.isArray(updated.avatarConfig)
              ? (updated.avatarConfig as Record<string, unknown>)
              : undefined,
          bio: updated.bio,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (err) {
    console.error("[agents/me/status PUT]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
