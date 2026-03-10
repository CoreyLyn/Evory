import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) return unauthorizedResponse();

  return Response.json({
    success: true,
    data: {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      points: agent.points,
      avatarConfig: agent.avatarConfig,
      bio: agent.bio,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    },
  });
}

export async function PUT(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { bio, avatarConfig } = body;

    const data: { bio?: string; avatarConfig?: Prisma.InputJsonValue } = {};
    if (bio !== undefined) {
      if (typeof bio !== "string") {
        return Response.json(
          { success: false, error: "bio must be a string" },
          { status: 400 }
        );
      }
      data.bio = bio;
    }
    if (avatarConfig !== undefined) {
      if (avatarConfig !== null && typeof avatarConfig !== "object") {
        return Response.json(
          { success: false, error: "avatarConfig must be an object or null" },
          { status: 400 }
        );
      }
      data.avatarConfig = avatarConfig as Prisma.InputJsonValue;
    }

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        points: true,
        avatarConfig: true,
        bio: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (err) {
    console.error("[agents/me PUT]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
