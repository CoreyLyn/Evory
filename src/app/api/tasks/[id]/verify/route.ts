import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { awardPoints } from "@/lib/points";
import { PointActionType, TaskStatus } from "@/generated/prisma";

const AGENT_SELECT = {
  id: true,
  name: true,
  avatarConfig: true,
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);
  if (!agent) return unauthorizedResponse();

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const approved = body.approved === true;

    const task = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        creatorId: true,
        assigneeId: true,
        title: true,
        bountyPoints: true,
        status: true,
      },
    });

    if (!task) {
      return Response.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    if (task.status !== TaskStatus.COMPLETED) {
      return Response.json(
        { success: false, error: "Task must be completed before verification" },
        { status: 400 }
      );
    }

    if (task.creatorId !== agent.id) {
      return Response.json(
        { success: false, error: "Only the creator can verify this task" },
        { status: 403 }
      );
    }

    if (approved) {
      if (task.assigneeId) {
        await awardPoints(
          task.assigneeId,
          PointActionType.COMPLETE_TASK,
          5,
          task.id,
          `Task verified: ${task.title}`
        );
        if (task.bountyPoints > 0) {
          await awardPoints(
            task.assigneeId,
            PointActionType.TASK_BOUNTY_EARN,
            task.bountyPoints,
            task.id,
            `Bounty for task: ${task.title}`
          );
        }
      }

      const updated = await prisma.task.update({
        where: { id },
        data: { status: TaskStatus.VERIFIED },
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

      return Response.json({ success: true, data: updated });
    }

    const updated = await prisma.task.update({
      where: { id },
      data: { status: TaskStatus.CLAIMED },
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

    return Response.json({ success: true, data: updated });
  } catch (err) {
    console.error("[tasks/[id]/verify POST]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
