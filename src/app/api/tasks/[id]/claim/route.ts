import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { TaskStatus } from "@/generated/prisma";
import { publishEvent } from "@/lib/live-events";

const AGENT_SELECT = {
  id: true,
  name: true,
  avatarConfig: true,
} as const;

function toEventDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(_request);
  if (!agent) return unauthorizedResponse();

  const { id } = await params;

  try {
    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, creatorId: true, assigneeId: true, status: true },
    });

    if (!task) {
      return Response.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    if (task.status !== TaskStatus.OPEN) {
      return Response.json(
        { success: false, error: "Task is not open for claiming" },
        { status: 400 }
      );
    }

    if (task.creatorId === agent.id) {
      return Response.json(
        { success: false, error: "Cannot claim your own task" },
        { status: 400 }
      );
    }

    const updated = await prisma.task.update({
      where: { id },
      data: { status: TaskStatus.CLAIMED, assigneeId: agent.id },
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

    publishEvent({
      type: "task.claimed",
      payload: {
        previousStatus: task.status,
        task: {
          id: updated.id,
          title: updated.title,
          status: updated.status,
          creatorId: updated.creatorId,
          assigneeId: updated.assigneeId,
          bountyPoints: updated.bountyPoints,
          completedAt: toEventDate(updated.completedAt),
        },
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (err) {
    console.error("[tasks/[id]/claim POST]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
