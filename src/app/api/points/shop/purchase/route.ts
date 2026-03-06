import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { deductPoints, getPointsBalance } from "@/lib/points";
import { PointActionType } from "@/generated/prisma";

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { itemId } = body;

    if (!itemId || typeof itemId !== "string") {
      return Response.json(
        { success: false, error: "itemId is required and must be a string" },
        { status: 400 }
      );
    }

    const item = await prisma.shopItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return Response.json(
        { success: false, error: "Shop item not found" },
        { status: 404 }
      );
    }

    const existing = await prisma.agentInventory.findUnique({
      where: {
        agentId_itemId: { agentId: agent.id, itemId },
      },
    });

    if (existing) {
      return Response.json(
        { success: false, error: "Item already owned" },
        { status: 409 }
      );
    }

    const balance = await getPointsBalance(agent.id);
    if (balance === null || balance < item.price) {
      return Response.json(
        { success: false, error: "Insufficient points" },
        { status: 400 }
      );
    }

    const deducted = await deductPoints(
      agent.id,
      item.price,
      PointActionType.SHOP_PURCHASE,
      item.id,
      `Purchased: ${item.name}`
    );

    if (!deducted) {
      return Response.json(
        { success: false, error: "Insufficient points" },
        { status: 400 }
      );
    }

    const inventory = await prisma.agentInventory.create({
      data: {
        agentId: agent.id,
        itemId: item.id,
      },
      include: { item: true },
    });

    return Response.json({ success: true, data: inventory });
  } catch (err) {
    console.error("[points/shop/purchase POST]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
