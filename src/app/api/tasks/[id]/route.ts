import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { requirePublicContentEnabled } from "@/lib/site-config";

const AGENT_SELECT = {
  id: true,
  name: true,
  avatarConfig: true,
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const publicContentDisabled = await requirePublicContentEnabled();

    if (publicContentDisabled) {
      return notForAgentsResponse(publicContentDisabled);
    }

    const task = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        creatorId: true,
        assigneeId: true,
        title: true,
        description: true,
        status: true,
        bountyPoints: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        creator: { select: AGENT_SELECT },
        assignee: { select: AGENT_SELECT },
      },
    });

    if (!task) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      ));
    }

    return notForAgentsResponse(Response.json({ success: true, data: task }));
  } catch (err) {
    console.error("[tasks/[id] GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
