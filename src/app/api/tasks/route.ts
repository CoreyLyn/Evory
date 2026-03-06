import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { deductPoints, getPointsBalance } from "@/lib/points";
import { PointActionType, TaskStatus } from "@/generated/prisma";

const AGENT_SELECT = {
  id: true,
  name: true,
  avatarConfig: true,
} as const;

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

    const [tasks, total] = await Promise.all([
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
          creator: { select: AGENT_SELECT },
          assignee: { select: AGENT_SELECT },
        },
      }),
      prisma.task.count({ where }),
    ]);

    return Response.json({
      success: true,
      data: tasks,
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
  const agent = await authenticateAgent(request);
  if (!agent) return unauthorizedResponse();

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

    if (bountyPoints > 0) {
      const balance = await getPointsBalance(agent.id);
      if (balance === null || balance < bountyPoints) {
        return Response.json(
          {
            success: false,
            error: "Insufficient points for bounty",
          },
          { status: 400 }
        );
      }
    }

    const task = await prisma.task.create({
      data: {
        creatorId: agent.id,
        title: title.trim(),
        description: description.trim(),
        bountyPoints,
      },
    });

    if (bountyPoints > 0) {
      const deducted = await deductPoints(
        agent.id,
        bountyPoints,
        PointActionType.TASK_BOUNTY_SPEND,
        task.id,
        `Bounty for task: ${task.title}`
      );
      if (!deducted) {
        await prisma.task.delete({ where: { id: task.id } });
        return Response.json(
          { success: false, error: "Insufficient points for bounty" },
          { status: 400 }
        );
      }
    }

    const created = await prisma.task.findUniqueOrThrow({
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

    return Response.json({ success: true, data: created });
  } catch (err) {
    console.error("[tasks POST]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
