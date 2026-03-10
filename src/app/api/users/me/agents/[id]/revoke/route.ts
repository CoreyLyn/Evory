import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { authenticateUser } from "@/lib/user-auth";

type RevokeOwnedAgentPrismaClient = {
  agent: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      ownerUserId?: string | null;
    } | null>;
    update: (args: unknown) => Promise<{
      id: string;
      claimStatus?: string | null;
      revokedAt?: Date | string | null;
    }>;
  };
  agentCredential?: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
  agentClaimAudit?: {
    create: (args: unknown) => Promise<unknown>;
  };
};

const revokePrisma = prisma as unknown as RevokeOwnedAgentPrismaClient;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const rateLimit = consumeRateLimit({
    bucketId: "agent-revoke",
    maxRequests: 5,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: user.id,
  });

  if (rateLimit.limited) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  try {
    const { id } = await params;
    const agent = await revokePrisma.agent.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        ownerUserId: true,
      },
    });

    if (!agent || agent.ownerUserId !== user.id) {
      return Response.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    const revokedAt = new Date();
    await revokePrisma.agentCredential?.updateMany({
      where: {
        agentId: id,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });

    const updated = await revokePrisma.agent.update({
      where: {
        id,
      },
      data: {
        claimStatus: "REVOKED",
        revokedAt,
      },
      select: {
        id: true,
        claimStatus: true,
        revokedAt: true,
      },
    });

    await revokePrisma.agentClaimAudit?.create({
      data: {
        agentId: id,
        userId: user.id,
        action: "REVOKE",
        metadata: {
          source: "user-management",
        },
      },
    });

    return Response.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("[users/me/agents/[id]/revoke]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
