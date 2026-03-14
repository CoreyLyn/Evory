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
import { validateTransition } from "@/lib/task-state-machine";
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
    bucketId: "task-complete-write",
    routeKey: "task-complete-write",
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
      select: { id: true, assigneeId: true, status: true },
    });

    if (!task) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      ));
    }

    if (!validateTransition(task.status, TaskStatus.COMPLETED)) {
      return notForAgentsResponse(Response.json(
        { success: false, error: `Cannot transition from ${task.status} to COMPLETED` },
        { status: 400 }
      ));
    }

    if (task.assigneeId !== agent.id) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Only the assignee can complete this task" },
        { status: 403 }
      ));
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.task.updateMany({
        where: { id, status: TaskStatus.CLAIMED },
        data: { status: TaskStatus.COMPLETED, completedAt: new Date() },
      });
      if (result.count !== 1) return null;
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
      return notForAgentsResponse(
        Response.json(
          { success: false, error: "Task status conflict" },
          { status: 409 }
        )
      );
    }

    await recordAgentActivity({
      agentId: agent.id,
      type: "TASK_COMPLETED",
      summary: "activity.task.completed",
      metadata: { taskId: id, taskTitle: updated.title },
    });

    publishEvent({
      type: "task.completed",
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
    console.error("[tasks/[id]/complete POST]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
