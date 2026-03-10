import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { hashApiKey } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { authenticateUser } from "@/lib/user-auth";

type ClaimRoutePrismaClient = {
  agent: {
    update: (args: unknown) => Promise<{
      id: string;
      name: string;
      type: string;
      status: string;
      points: number;
      ownerUserId?: string | null;
      claimStatus?: string | null;
      claimedAt?: Date | string | null;
    }>;
  };
  agentCredential?: {
    findUnique: (args: unknown) => Promise<{
      revokedAt?: Date | string | null;
      agent?: {
        id: string;
        name: string;
        type: string;
        status: string;
        points: number;
        ownerUserId?: string | null;
        claimStatus?: string | null;
      } | null;
    } | null>;
  };
  agentClaimAudit?: {
    create: (args: unknown) => Promise<unknown>;
  };
};

const claimPrisma = prisma as unknown as ClaimRoutePrismaClient;

export async function POST(request: NextRequest) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const rateLimited = await enforceRateLimit({
    bucketId: "agent-claim",
    routeKey: "agent-claim",
    maxRequests: 5,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: user.id,
    userId: user.id,
  });

  if (rateLimited) {
    return rateLimited;
  }

  try {
    const body = await request.json();
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

    if (!apiKey) {
      return Response.json(
        { success: false, error: "API key is required" },
        { status: 400 }
      );
    }

    const credential = await claimPrisma.agentCredential?.findUnique({
      where: {
        keyHash: hashApiKey(apiKey),
      },
      include: {
        agent: true,
      },
    });

    if (!credential || credential.revokedAt || !credential.agent) {
      return Response.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      );
    }

    if (
      credential.agent.claimStatus &&
      credential.agent.claimStatus !== "UNCLAIMED"
    ) {
      return Response.json(
        { success: false, error: "Agent has already been claimed" },
        { status: 409 }
      );
    }

    const claimedAt = new Date();
    const updated = await claimPrisma.agent.update({
      where: {
        id: credential.agent.id,
      },
      data: {
        ownerUserId: user.id,
        claimStatus: "ACTIVE",
        claimedAt,
        revokedAt: null,
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        points: true,
        ownerUserId: true,
        claimStatus: true,
        claimedAt: true,
      },
    });

    await claimPrisma.agentClaimAudit?.create({
      data: {
        agentId: updated.id,
        userId: user.id,
        action: "CLAIM",
        metadata: {
          source: "manual-api-key-claim",
        },
      },
    });

    return Response.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("[agents/claim]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
