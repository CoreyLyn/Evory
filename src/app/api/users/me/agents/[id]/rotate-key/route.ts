import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { generateApiKey, hashApiKey } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { authenticateUser } from "@/lib/user-auth";

type RotateOwnedAgentPrismaClient = {
  agent: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      ownerUserId?: string | null;
      claimStatus?: string | null;
    } | null>;
    update: (args: unknown) => Promise<{
      id: string;
      claimStatus?: string | null;
    }>;
  };
  agentCredential?: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
    updateMany: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
  };
  agentClaimAudit?: {
    create: (args: unknown) => Promise<unknown>;
  };
};

const rotatePrisma = prisma as unknown as RotateOwnedAgentPrismaClient;

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

  const { id } = await params;
  const rateLimited = await enforceRateLimit({
    bucketId: "agent-rotate-key",
    routeKey: "agent-rotate-key",
    maxRequests: 5,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: user.id,
    userId: user.id,
    metadata: {
      agentId: id,
    },
  });

  if (rateLimited) {
    return rateLimited;
  }

  try {
    const agent = await rotatePrisma.agent.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        ownerUserId: true,
        claimStatus: true,
      },
    });

    if (!agent || agent.ownerUserId !== user.id) {
      return Response.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    let apiKey = generateApiKey();
    let isUnique = false;
    while (!isUnique) {
      const collision = await rotatePrisma.agentCredential?.findUnique({
        where: { keyHash: hashApiKey(apiKey) },
      });

      if (!collision) {
        isUnique = true;
      } else {
        apiKey = generateApiKey();
      }
    }

    const now = new Date();
    await rotatePrisma.agentCredential?.updateMany({
      where: {
        agentId: id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        rotatedAt: now,
      },
    });
    await rotatePrisma.agentCredential?.create({
      data: {
        agentId: id,
        keyHash: hashApiKey(apiKey),
        label: "default",
        last4: apiKey.slice(-4),
      },
    });

    const updated = await rotatePrisma.agent.update({
      where: {
        id,
      },
      data: {
        claimStatus: agent.claimStatus ?? "ACTIVE",
        revokedAt: null,
      },
      select: {
        id: true,
        claimStatus: true,
      },
    });

    await rotatePrisma.agentClaimAudit?.create({
      data: {
        agentId: id,
        userId: user.id,
        action: "ROTATE_KEY",
        metadata: {
          source: "user-management",
        },
      },
    });

    return Response.json({
      success: true,
      data: {
        id: updated.id,
        claimStatus: updated.claimStatus ?? "ACTIVE",
        apiKey,
        credentialLast4: apiKey.slice(-4),
      },
    });
  } catch (error) {
    console.error("[users/me/agents/[id]/rotate-key]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
