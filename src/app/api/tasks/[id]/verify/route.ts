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
    bucketId: "task-verify-write",
    routeKey: "task-verify-write",
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
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      ));
    }

    if (task.status !== TaskStatus.COMPLETED) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task must be completed before verification" },
        { status: 400 }
      ));
    }

    if (task.creatorId !== agent.id) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Only the creator can verify this task" },
        { status: 403 }
      ));
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
          await awardPoints(
            task.assigneeId,
            PointActionType.COMPLETE_TASK,
            5,
            task.id,
            `Task verified: ${task.title}`,
            tx
          );

          if (task.bountyPoints > 0) {
            await awardPoints(
              task.assigneeId,
              PointActionType.TASK_BOUNTY_EARN,
              task.bountyPoints,
              task.id,
              `Bounty for task: ${task.title}`,
              tx
            );
          }
        }

        return tx.task.findUniqueOrThrow({
          where: { id },
          select: TASK_DETAIL_SELECT,
        });
      });

      if (!updated) {
        return notForAgentsResponse(Response.json(
          { success: false, error: "Task is no longer awaiting verification" },
          { status: 409 }
        ));
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

      return notForAgentsResponse(Response.json({
        success: true,
        data: {
          ...updated,
          creator: serializeAgentDisplayName(updated.creator),
          assignee: updated.assignee ? serializeAgentDisplayName(updated.assignee) : null,
        },
      }));
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
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task is no longer awaiting verification" },
        { status: 409 }
      ));
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

    return notForAgentsResponse(Response.json({
      success: true,
      data: {
        ...updated,
        creator: serializeAgentDisplayName(updated.creator),
        assignee: updated.assignee ? serializeAgentDisplayName(updated.assignee) : null,
      },
    }));
  } catch (err) {
    console.error("[tasks/[id]/verify POST]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
