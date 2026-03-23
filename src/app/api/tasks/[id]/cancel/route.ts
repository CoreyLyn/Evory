import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { serializeAgentDisplayName } from "@/lib/agent-display-name";
import {
  agentContextHasScope,
  authenticateAgentContext,
  forbiddenAgentScopeResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PointActionType, TaskStatus } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/live-events";
import { awardPoints } from "@/lib/points";

const AGENT_SELECT = {
  id: true,
  name: true,
  isDeletedPlaceholder: true,
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
  reviewComment: true,
  reviewedAt: true,
  creator: { select: AGENT_SELECT },
  assignee: { select: AGENT_SELECT },
} as const;

function toEventDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const agentContext = await authenticateAgentContext(request);
  if (!agentContext) return notForAgentsResponse(unauthorizedResponse());
  if (!agentContextHasScope(agentContext, "tasks:write")) {
    return notForAgentsResponse(forbiddenAgentScopeResponse("tasks:write"));
  }

  const abuseLimited = await enforceRateLimit({
    bucketId: "task-cancel-write",
    routeKey: "task-cancel-write",
    maxRequests: 10,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: agentContext.agent.id,
    eventType: "AGENT_ABUSE_LIMIT_HIT",
    metadata: {
      agentId: agentContext.agent.id,
    },
  });

  if (abuseLimited) {
    return notForAgentsResponse(abuseLimited);
  }

  const agent = agentContext.agent;
  const { id } = await params;

  try {
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
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      ));
    }

    if (task.creatorId !== agent.id) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Only the creator can cancel this task" },
        { status: 403 }
      ));
    }

    if (task.status !== TaskStatus.OPEN && task.status !== TaskStatus.CLAIMED) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task can only be cancelled when open or claimed" },
        { status: 400 }
      ));
    }

    const updated = await prisma.$transaction(async (tx) => {
      const cancelled = await tx.task.updateMany({
        where: {
          id,
          creatorId: agent.id,
          status: task.status,
        },
        data: {
          status: TaskStatus.CANCELLED,
          completedAt: null,
        },
      });

      if (cancelled.count !== 1) {
        return null;
      }

      if (task.bountyPoints > 0) {
        await awardPoints(
          agent.id,
          PointActionType.TASK_BOUNTY_REFUND,
          task.bountyPoints,
          task.id,
          `Refund bounty for cancelled task: ${task.title}`,
          tx
        );
      }

      await tx.agentActivity.create({
        data: {
          agentId: agent.id,
          type: "TASK_CANCELLED",
          summary: "activity.task.cancelled",
          metadata: { taskId: task.id, taskTitle: task.title },
        },
      });

      return tx.task.findUniqueOrThrow({
        where: { id },
        select: TASK_DETAIL_SELECT,
      });
    });

    if (!updated) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task is no longer open or claimed" },
        { status: 409 }
      ));
    }

    publishEvent({
      type: "task.cancelled",
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

    return notForAgentsResponse(Response.json({
      success: true,
      data: {
        ...updated,
        creator: serializeAgentDisplayName(updated.creator),
        assignee: updated.assignee ? serializeAgentDisplayName(updated.assignee) : null,
      },
    }));
  } catch (err) {
    console.error("[tasks/[id]/cancel POST]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
