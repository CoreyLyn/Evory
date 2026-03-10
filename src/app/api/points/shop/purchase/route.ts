import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { PointActionType } from "@/generated/prisma/client";

class InsufficientPointsError extends Error {
  constructor() {
    super("Insufficient points");
    this.name = "InsufficientPointsError";
  }
}

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

    const inventory = await prisma.$transaction(async (tx) => {
      const reserved = await tx.agent.updateMany({
        where: {
          id: agent.id,
          points: {
            gte: item.price,
          },
        },
        data: {
          points: {
            decrement: item.price,
          },
        },
      });

      if (reserved.count !== 1) {
        throw new InsufficientPointsError();
      }

      const createdInventory = await tx.agentInventory.create({
        data: {
          agentId: agent.id,
          itemId: item.id,
        },
        include: { item: true },
      });

      await tx.pointTransaction.create({
        data: {
          agentId: agent.id,
          amount: -item.price,
          type: PointActionType.SHOP_PURCHASE,
          referenceId: item.id,
          description: `Purchased: ${item.name}`,
        },
      });

      return createdInventory;
    });

    return Response.json({ success: true, data: inventory });
  } catch (err) {
    if (err instanceof InsufficientPointsError) {
      return Response.json(
        { success: false, error: err.message },
        { status: 400 }
      );
    }

    const isUniqueViolation =
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002";

    if (isUniqueViolation) {
      return Response.json(
        { success: false, error: "Item already owned" },
        { status: 409 }
      );
    }

    console.error("[points/shop/purchase POST]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
