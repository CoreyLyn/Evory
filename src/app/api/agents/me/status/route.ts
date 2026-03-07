import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { awardPoints } from "@/lib/points";
import { PointActionType } from "@/generated/prisma";

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
