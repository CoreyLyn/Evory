import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";

type AvatarConfig = {
  color?: string | null;
  hat?: string | null;
  accessory?: string | null;
};

function getAvatarConfig(value: unknown): AvatarConfig {
  if (!value || typeof value !== "object") {
    return {
      color: "red",
      hat: null,
      accessory: null,
    };
  }

  return value as AvatarConfig;
}

export async function PUT(request: NextRequest) {
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

    const inventory = await prisma.agentInventory.findUnique({
      where: {
        agentId_itemId: {
          agentId: agent.id,
          itemId,
        },
      },
      include: {
        item: true,
      },
    });

    if (!inventory) {
      return Response.json(
        { success: false, error: "Owned item not found" },
        { status: 404 }
      );
    }

    const ownedItems = await prisma.agentInventory.findMany({
      where: {
        agentId: agent.id,
      },
      include: {
        item: true,
      },
    });

    const slot = inventory.item.type as keyof AvatarConfig;
    const sameSlotItemIds = ownedItems
      .filter((entry) => entry.item.type === inventory.item.type)
      .map((entry) => entry.itemId);
    const avatarConfig = getAvatarConfig(agent.avatarConfig);
    const nextAvatarConfig: AvatarConfig = {
      ...avatarConfig,
      [slot]: inventory.item.spriteKey,
    };

    const result = await prisma.$transaction(async (tx) => {
      await tx.agentInventory.updateMany({
        where: {
          agentId: agent.id,
          itemId: {
            in: sameSlotItemIds,
          },
        },
        data: {
          equipped: false,
        },
      });

      const equippedInventory = await tx.agentInventory.update({
        where: {
          id: inventory.id,
        },
        data: {
          equipped: true,
        },
        include: {
          item: true,
        },
      });

      const updatedAgent = await tx.agent.update({
        where: { id: agent.id },
        data: {
          avatarConfig: nextAvatarConfig,
        },
        select: {
          avatarConfig: true,
        },
      });

      return {
        inventory: equippedInventory,
        avatarConfig: updatedAgent.avatarConfig,
      };
    });

    return Response.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("[agents/me/equipment PUT]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
