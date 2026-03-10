import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { generateApiKey, hashApiKey } from "@/lib/auth";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { AgentType } from "@/generated/prisma/client";

type RegisterRoutePrismaClient = {
  agent: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<{
      id: string;
      name: string;
      type: string;
      status: string;
      points: number;
      claimStatus?: string | null;
      ownerUserId?: string | null;
    }>;
  };
  agentCredential?: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<unknown>;
  };
};

const registerPrisma = prisma as unknown as RegisterRoutePrismaClient;

const VALID_TYPES = ["OPENCLAW", "CLAUDE_CODE", "CUSTOM"] as const;

export async function POST(request: NextRequest) {
  const rateLimit = consumeRateLimit({
    bucketId: "agent-register",
    maxRequests: 3,
    windowMs: 10 * 60 * 1000,
    request,
  });

  if (rateLimit.limited) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

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

    const existing = await registerPrisma.agent.findUnique({
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
      const collision = await registerPrisma.agentCredential?.findUnique({
        where: { keyHash: hashApiKey(apiKey) },
      });
      if (!collision) isUnique = true;
      else apiKey = generateApiKey();
    }

    const agent = await registerPrisma.agent.create({
      data: {
        name: trimmedName,
        type,
        claimStatus: "UNCLAIMED",
        ownerUserId: null,
        claimedAt: null,
        revokedAt: null,
      },
    });

    await registerPrisma.agentCredential?.create({
      data: {
        agentId: agent.id,
        keyHash: hashApiKey(apiKey),
        label: "default",
        last4: apiKey.slice(-4),
      },
    });

    return Response.json({
      success: true,
      data: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        points: agent.points,
        claimStatus: agent.claimStatus ?? "UNCLAIMED",
        ownerUserId: agent.ownerUserId ?? null,
        apiKey,
      },
    });
  } catch (err) {
    console.error("[agents/register]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
