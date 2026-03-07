import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) return unauthorizedResponse();

  try {
    const inventory = await prisma.agentInventory.findMany({
      where: { agentId: agent.id },
      include: {
        item: true,
      },
      orderBy: [{ equipped: "desc" }, { purchasedAt: "desc" }],
    });

    return Response.json({
      success: true,
      data: inventory,
    });
  } catch (err) {
    console.error("[agents/me/inventory GET]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
