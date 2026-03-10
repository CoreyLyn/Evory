import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import {
  buildAgentCredentialDefaults,
  generateApiKey,
  hashApiKey,
} from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { authenticateUser } from "@/lib/user-auth";

type RotateOwnedAgentPrismaClient = {
  agent: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      ownerUserId?: string | null;
      claimStatus?: string | null;
      revokedAt?: Date | string | null;
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
  $transaction: <T>(
    input: (tx: RotateOwnedAgentPrismaClient) => Promise<T>
  ) => Promise<T>;
};

const rotatePrisma = prisma as unknown as RotateOwnedAgentPrismaClient;

function hasContradictoryClaimState(agent: {
  ownerUserId?: string | null;
  claimStatus?: string | null;
  revokedAt?: Date | string | null;
}) {
  if (agent.claimStatus === "UNCLAIMED") {
    return Boolean(agent.ownerUserId || agent.revokedAt);
  }

  if (agent.claimStatus === "ACTIVE") {
    return !agent.ownerUserId || Boolean(agent.revokedAt);
  }

  if (agent.claimStatus === "REVOKED") {
    return !agent.revokedAt;
  }

  return false;
}

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

  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "agent-rotate-key",
    userId: user.id,
  });

  if (sameOriginRejected) {
    return sameOriginRejected;
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
        revokedAt: true,
      },
    });

    if (!agent || agent.ownerUserId !== user.id) {
      return Response.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    if (hasContradictoryClaimState(agent)) {
      return Response.json(
        { success: false, error: "Agent state is invalid for key rotation" },
        { status: 409 }
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
    const credentialDefaults = buildAgentCredentialDefaults(now);
    const updated = await rotatePrisma.$transaction(async (tx) => {
      await tx.agentCredential?.updateMany({
        where: {
          agentId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          rotatedAt: now,
        },
      });
      await tx.agentCredential?.create({
        data: {
          agentId: id,
          keyHash: hashApiKey(apiKey),
          label: "default",
          last4: apiKey.slice(-4),
          scopes: credentialDefaults.scopes,
          expiresAt: credentialDefaults.expiresAt,
        },
      });

      const nextAgent = await tx.agent.update({
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

      await tx.agentClaimAudit?.create({
        data: {
          agentId: id,
          userId: user.id,
          action: "ROTATE_KEY",
          metadata: {
            source: "user-management",
          },
        },
      });

      return nextAgent;
    });

    return Response.json({
      success: true,
      data: {
        id: updated.id,
        claimStatus: updated.claimStatus ?? "ACTIVE",
        apiKey,
        credentialLast4: apiKey.slice(-4),
        credentialScopes: credentialDefaults.scopes,
        credentialExpiresAt: credentialDefaults.expiresAt.toISOString(),
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
