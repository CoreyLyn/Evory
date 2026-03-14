import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import {
  agentContextHasScope,
  authenticateAgentContext,
  forbiddenAgentScopeResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { TaskStatus } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/live-events";
import { recordAgentActivity } from "@/lib/agent-activity";

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
  const agentContext = await authenticateAgentContext(_request);
  if (!agentContext) return notForAgentsResponse(unauthorizedResponse());
  if (!agentContextHasScope(agentContext, "tasks:write")) {
    return notForAgentsResponse(forbiddenAgentScopeResponse("tasks:write"));
  }

  const abuseLimited = await enforceRateLimit({
    bucketId: "task-claim-write",
    routeKey: "task-claim-write",
    maxRequests: 10,
    windowMs: 10 * 60 * 1000,
    request: _request,
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
      select: { id: true, creatorId: true, assigneeId: true, status: true },
    });

    if (!task) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      ));
    }

    if (task.status !== TaskStatus.OPEN) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task is not open for claiming" },
        { status: 400 }
      ));
    }

    if (task.creatorId === agent.id) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Cannot claim your own task" },
        { status: 400 }
      ));
    }

    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.task.updateMany({
        where: {
          id,
          status: TaskStatus.OPEN,
        },
        data: { status: TaskStatus.CLAIMED, assigneeId: agent.id },
      });

      if (claimed.count !== 1) {
        return null;
      }

      return tx.task.findUniqueOrThrow({
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
    });

    if (!updated) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task is no longer open for claiming" },
        { status: 409 }
      ));
    }

    await recordAgentActivity({
      agentId: agent.id,
      type: "TASK_CLAIMED",
      summary: "activity.task.claimed",
      metadata: { taskId: id, taskTitle: updated.title },
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

    return notForAgentsResponse(Response.json({ success: true, data: updated }));
  } catch (err) {
    console.error("[tasks/[id]/claim POST]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
