import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { PointActionType, TaskStatus } from "@/generated/prisma";
import { publishEvent } from "@/lib/live-events";

const AGENT_SELECT = {
  id: true,
  name: true,
  avatarConfig: true,
} as const;

const TASK_DETAIL_SELECT = {
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
} as const;

function toEventDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

type TaskTransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

async function createPointAward(
  tx: TaskTransactionClient,
  {
    agentId,
    amount,
    type,
    referenceId,
    description,
  }: {
    agentId: string;
    amount: number;
    type: PointActionType;
    referenceId: string;
    description: string;
  }
) {
  if (amount <= 0) return;

  await tx.pointTransaction.create({
    data: {
      agentId,
      amount,
      type,
      referenceId,
      description,
    },
  });

  await tx.agent.update({
    where: { id: agentId },
    data: {
      points: {
        increment: amount,
      },
    },
  });
}

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
      const updated = await prisma.$transaction(async (tx) => {
        const transition = await tx.task.updateMany({
          where: {
            id,
            creatorId: agent.id,
            status: TaskStatus.COMPLETED,
          },
          data: {
            status: TaskStatus.VERIFIED,
          },
        });

        if (transition.count !== 1) {
          return null;
        }

        if (task.assigneeId) {
          await createPointAward(tx, {
            agentId: task.assigneeId,
            amount: 5,
            type: PointActionType.COMPLETE_TASK,
            referenceId: task.id,
            description: `Task verified: ${task.title}`,
          });

          if (task.bountyPoints > 0) {
            await createPointAward(tx, {
              agentId: task.assigneeId,
              amount: task.bountyPoints,
              type: PointActionType.TASK_BOUNTY_EARN,
              referenceId: task.id,
              description: `Bounty for task: ${task.title}`,
              });
          }
        }

        return tx.task.findUniqueOrThrow({
          where: { id },
          select: TASK_DETAIL_SELECT,
        });
      });

      if (!updated) {
        return Response.json(
          { success: false, error: "Task is no longer awaiting verification" },
          { status: 409 }
        );
      }

      publishEvent({
        type: "task.verified",
        payload: {
          previousStatus: task.status,
          approved: true,
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
    }

    const updated = await prisma.$transaction(async (tx) => {
      const transition = await tx.task.updateMany({
        where: {
          id,
          creatorId: agent.id,
          status: TaskStatus.COMPLETED,
        },
        data: {
          status: TaskStatus.CLAIMED,
          completedAt: null,
        },
      });

      if (transition.count !== 1) {
        return null;
      }

      return tx.task.findUniqueOrThrow({
        where: { id },
        select: TASK_DETAIL_SELECT,
      });
    });

    if (!updated) {
      return Response.json(
        { success: false, error: "Task is no longer awaiting verification" },
        { status: 409 }
      );
    }

    publishEvent({
      type: "task.verified",
      payload: {
        previousStatus: task.status,
        approved: false,
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
    console.error("[tasks/[id]/verify POST]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
