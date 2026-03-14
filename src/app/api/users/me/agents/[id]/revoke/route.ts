import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { authenticateUser } from "@/lib/user-auth";
import { recordAgentActivity } from "@/lib/agent-activity";

type RevokeOwnedAgentPrismaClient = {
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
      revokedAt?: Date | string | null;
    }>;
  };
  agentCredential?: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
  agentClaimAudit?: {
    create: (args: unknown) => Promise<unknown>;
  };
  $transaction: <T>(
    input: (tx: RevokeOwnedAgentPrismaClient) => Promise<T>
  ) => Promise<T>;
};

const revokePrisma = prisma as unknown as RevokeOwnedAgentPrismaClient;

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
    routeKey: "agent-revoke",
    userId: user.id,
  });

  if (sameOriginRejected) {
    return sameOriginRejected;
  }

  const { id } = await params;
  const rateLimited = await enforceRateLimit({
    bucketId: "agent-revoke",
    routeKey: "agent-revoke",
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
    const agent = await revokePrisma.agent.findUnique({
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

    if (agent.claimStatus === "REVOKED") {
      return Response.json(
        { success: false, error: "Agent already revoked" },
        { status: 409 }
      );
    }

    if (hasContradictoryClaimState(agent)) {
      return Response.json(
        { success: false, error: "Agent state is invalid for revoke" },
        { status: 409 }
      );
    }

    const revokedAt = new Date();
    const updated = await revokePrisma.$transaction(async (tx) => {
      await tx.agentCredential?.updateMany({
        where: {
          agentId: id,
          revokedAt: null,
        },
        data: {
          revokedAt,
        },
      });

      const nextAgent = await tx.agent.update({
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

      await tx.agentClaimAudit?.create({
        data: {
          agentId: id,
          userId: user.id,
          action: "REVOKE",
          metadata: {
            source: "user-management",
          },
        },
      });

      await recordAgentActivity(
        {
          agentId: id,
          type: "CREDENTIAL_REVOKED",
          summary: "activity.credential.revoked",
          metadata: { userId: user.id },
        },
        tx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
      );

      return nextAgent;
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
