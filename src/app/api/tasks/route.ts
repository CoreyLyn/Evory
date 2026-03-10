import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  agentContextHasScope,
  authenticateAgentContext,
  forbiddenAgentScopeResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { PointActionType, TaskStatus } from "@/generated/prisma/client";
import { enforceRateLimit } from "@/lib/rate-limit";
import { runSequentialPageQuery } from "@/lib/paginated-query";

const AGENT_SELECT = {
  id: true,
  name: true,
  avatarConfig: true,
} as const;

class InsufficientPointsError extends Error {
  constructor() {
    super("Insufficient points for bounty");
    this.name = "InsufficientPointsError";
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10))
    );
    const status = searchParams.get("status") as TaskStatus | null;

    const where = status && status in TaskStatus ? { status } : {};

    const { items: tasks, total } = await runSequentialPageQuery({
      getItems: () =>
        prisma.task.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
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
          },
        }),
      getTotal: () => prisma.task.count({ where }),
    });

    const agentIds = [
      ...new Set(
        tasks.flatMap((task) =>
          [task.creatorId, task.assigneeId].filter((id): id is string => Boolean(id))
        )
      ),
    ];
    const agents = await prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: AGENT_SELECT,
    });
    const agentsById = new Map(agents.map((agent) => [agent.id, agent]));

    const data = tasks.map((task) => ({
      ...task,
      creator: agentsById.get(task.creatorId) ?? null,
      assignee: task.assigneeId ? agentsById.get(task.assigneeId) ?? null : null,
    }));

    return Response.json({
      success: true,
      data,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error("[tasks GET]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const agentContext = await authenticateAgentContext(request);
  if (!agentContext) return unauthorizedResponse();
  if (!agentContextHasScope(agentContext, "tasks:write")) {
    return forbiddenAgentScopeResponse("tasks:write");
  }

  const abuseLimited = await enforceRateLimit({
    bucketId: "task-create-write",
    routeKey: "task-create-write",
    maxRequests: 5,
    windowMs: 10 * 60 * 1000,
    request,
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

  try {
    const body = await request.json();
    const { title, description, bountyPoints: bountyInput } = body;

    if (!title || typeof title !== "string") {
      return Response.json(
        { success: false, error: "title is required and must be a string" },
        { status: 400 }
      );
    }
    if (!description || typeof description !== "string") {
      return Response.json(
        { success: false, error: "description is required and must be a string" },
        { status: 400 }
      );
    }

    const bountyPoints = Math.max(
      0,
      typeof bountyInput === "number" ? Math.floor(bountyInput) : 0
    );
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    const created = await prisma.$transaction(async (tx) => {
      if (bountyPoints > 0) {
        const reserved = await tx.agent.updateMany({
          where: {
            id: agent.id,
            points: {
              gte: bountyPoints,
            },
          },
          data: {
            points: {
              decrement: bountyPoints,
            },
          },
        });

        if (reserved.count !== 1) {
          throw new InsufficientPointsError();
        }
      }

      const task = await tx.task.create({
        data: {
          creatorId: agent.id,
          title: trimmedTitle,
          description: trimmedDescription,
          bountyPoints,
        },
      });

      if (bountyPoints > 0) {
        await tx.pointTransaction.create({
          data: {
            agentId: agent.id,
            amount: -bountyPoints,
            type: PointActionType.TASK_BOUNTY_SPEND,
            referenceId: task.id,
            description: `Bounty for task: ${trimmedTitle}`,
          },
        });
      }

      return tx.task.findUniqueOrThrow({
        where: { id: task.id },
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

    return Response.json({ success: true, data: created });
  } catch (err) {
    if (err instanceof InsufficientPointsError) {
      return Response.json(
        { success: false, error: err.message },
        { status: 400 }
      );
    }

    console.error("[tasks POST]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
