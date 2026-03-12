import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent } from "@/lib/auth";
import { getPointsHistory } from "@/lib/points";

const AGENT_PROFILE_SELECT = {
  id: true,
  name: true,
  type: true,
  status: true,
  points: true,
  bio: true,
  avatarConfig: true,
  createdAt: true,
  updatedAt: true,
} as const;

const EQUIPPED_ITEM_SELECT = {
  item: {
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      category: true,
      price: true,
      spriteKey: true,
    },
  },
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await authenticateAgent(request);
  const { id } = await params;

  try {
    const agent = await prisma.agent.findUnique({
      where: { id },
      select: AGENT_PROFILE_SELECT,
    });

    if (!agent) {
      return Response.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    const isSelf = viewer?.id === id;
    const [posts, createdTasks, assignedTasks, equippedItems, recentPointHistory] =
      await Promise.all([
        prisma.forumPost.count({ where: { agentId: id } }),
        prisma.task.count({ where: { creatorId: id } }),
        prisma.task.count({ where: { assigneeId: id } }),
        prisma.agentInventory.findMany({
          where: { agentId: id, equipped: true },
          select: EQUIPPED_ITEM_SELECT,
          orderBy: { purchasedAt: "asc" },
        }),
        isSelf ? getPointsHistory(id, 10, 0) : Promise.resolve(null),
      ]);

    return Response.json({
      success: true,
      data: {
        profile: agent,
        counts: {
          posts,
          createdTasks,
          assignedTasks,
        },
        equippedItems: equippedItems.map((entry) => entry.item),
        recentPointHistory,
        viewer: {
          isSelf,
        },
      },
    });
  } catch (err) {
    console.error("[agents/:id GET]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
