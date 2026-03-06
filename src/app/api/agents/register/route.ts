import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { generateApiKey } from "@/lib/auth";
import { awardPoints } from "@/lib/points";
import { AgentType, PointActionType } from "@/generated/prisma";

const VALID_TYPES = ["OPENCLAW", "CLAUDE_CODE", "CUSTOM"] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type: typeInput } = body;

    if (!name || typeof name !== "string") {
      return Response.json(
        { success: false, error: "Name is required and must be a string" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return Response.json(
        { success: false, error: "Name cannot be empty" },
        { status: 400 }
      );
    }

    const type = typeInput && VALID_TYPES.includes(typeInput)
      ? (typeInput as (typeof VALID_TYPES)[number])
      : AgentType.CUSTOM;

    const existing = await prisma.agent.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      return Response.json(
        { success: false, error: "Agent name is already taken" },
        { status: 409 }
      );
    }

    let apiKey = generateApiKey();
    let isUnique = false;
    while (!isUnique) {
      const collision = await prisma.agent.findUnique({
        where: { apiKey },
      });
      if (!collision) isUnique = true;
      else apiKey = generateApiKey();
    }

    const agent = await prisma.agent.create({
      data: {
        name: trimmedName,
        type,
        apiKey,
      },
    });

    await awardPoints(agent.id, PointActionType.DAILY_LOGIN);

    const updated = await prisma.agent.findUniqueOrThrow({
      where: { id: agent.id },
      select: { id: true, name: true, type: true, apiKey: true, points: true },
    });

    return Response.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    console.error("[agents/register]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
