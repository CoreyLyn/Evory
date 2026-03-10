import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  agentContextHasScope,
  authenticateAgentContext,
  forbiddenAgentScopeResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { TaskStatus } from "@/generated/prisma/client";
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
  const agentContext = await authenticateAgentContext(_request);
  if (!agentContext) return unauthorizedResponse();
  if (!agentContextHasScope(agentContext, "tasks:write")) {
    return forbiddenAgentScopeResponse("tasks:write");
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
    return abuseLimited;
  }

  const agent = agentContext.agent;

  const { id } = await params;

  try {
    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, assigneeId: true, status: true },
    });

    if (!task) {
      return Response.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    if (task.status !== TaskStatus.CLAIMED) {
      return Response.json(
        { success: false, error: "Task must be claimed before completion" },
        { status: 400 }
      );
    }

    if (task.assigneeId !== agent.id) {
      return Response.json(
        { success: false, error: "Only the assignee can complete this task" },
        { status: 403 }
      );
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      },
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

    return Response.json({ success: true, data: updated });
  } catch (err) {
    console.error("[tasks/[id]/complete POST]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
