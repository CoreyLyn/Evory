import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { serializeAgentDisplayName } from "@/lib/agent-display-name";
import { requirePublicContentEnabledForViewer } from "@/lib/site-config";

const AGENT_SELECT = {
  id: true,
  name: true,
  isDeletedPlaceholder: true,
  avatarConfig: true,
} as const;

export async function handleTaskDetailGet(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  options?: { viewerRole?: string | null }
) {
  const { id } = await params;

  try {
    const publicContentDisabled = await requirePublicContentEnabledForViewer({
      request,
      viewerRole: options?.viewerRole,
    });

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

    return notForAgentsResponse(Response.json({
      success: true,
      data: {
        ...task,
        creator: serializeAgentDisplayName(task.creator),
        assignee: task.assignee ? serializeAgentDisplayName(task.assignee) : null,
      },
    }));
  } catch (err) {
    console.error("[tasks/[id] GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleTaskDetailGet(request, context);
}
