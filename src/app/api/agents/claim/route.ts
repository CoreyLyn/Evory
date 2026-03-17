import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { hashApiKey } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { authenticateUser } from "@/lib/user-auth";
import { recordAgentActivity } from "@/lib/agent-activity";

type ClaimRoutePrismaClient = {
  agent: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      name: string;
      type: string;
      status: string;
      points: number;
      showOwnerInPublic?: boolean | null;
      ownerUserId?: string | null;
      claimStatus?: string | null;
      claimedAt?: Date | string | null;
      revokedAt?: Date | string | null;
    } | null>;
    update: (args: unknown) => Promise<{
      id: string;
      name: string;
      type: string;
      status: string;
      points: number;
      showOwnerInPublic?: boolean | null;
      ownerUserId?: string | null;
      claimStatus?: string | null;
      claimedAt?: Date | string | null;
    }>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  agentCredential?: {
    findUnique: (args: unknown) => Promise<{
      revokedAt?: Date | string | null;
      expiresAt?: Date | string | null;
      agent?: {
        id: string;
        name: string;
        type: string;
        status: string;
        points: number;
        ownerUserId?: string | null;
        claimStatus?: string | null;
        revokedAt?: Date | string | null;
      } | null;
    } | null>;
  };
  agentClaimAudit?: {
    create: (args: unknown) => Promise<unknown>;
  };
  $transaction: <T>(
    input: (tx: ClaimRoutePrismaClient) => Promise<T>
  ) => Promise<T>;
};

const claimPrisma = prisma as unknown as ClaimRoutePrismaClient;

function isCredentialExpired(expiresAt: Date | string | null | undefined) {
  if (!expiresAt) {
    return false;
  }

  const value = new Date(expiresAt);
  if (Number.isNaN(value.getTime())) {
    return false;
  }

  return value.getTime() <= Date.now();
}

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

async function resolveClaimRateLimitMetadata(
  request: NextRequest,
  userId: string
) {
  try {
    const body = await request.clone().json();
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

    if (!apiKey) {
      return {};
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
      return {};
    }

    const isVisibleToUser =
      credential.agent.ownerUserId === userId ||
      credential.agent.claimStatus === "UNCLAIMED";

    if (!isVisibleToUser) {
      return {};
    }

    return {
      agentId: credential.agent.id,
      agentName: credential.agent.name,
    };
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "agent-claim",
    userId: user.id,
  });

  if (sameOriginRejected) {
    return sameOriginRejected;
  }

  const rateLimited = await enforceRateLimit({
    bucketId: "agent-claim",
    routeKey: "agent-claim",
    maxRequests: 5,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: user.id,
    userId: user.id,
    resolveMetadata: () => resolveClaimRateLimitMetadata(request, user.id),
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

    if (isCredentialExpired(credential.expiresAt)) {
      return Response.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      );
    }

    if (hasContradictoryClaimState(credential.agent)) {
      return Response.json(
        { success: false, error: "Agent state is invalid for claim" },
        { status: 409 }
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
    const updated = await claimPrisma.$transaction(async (tx) => {
      const transition = await tx.agent.updateMany({
        where: {
          id: credential.agent?.id,
          ownerUserId: null,
          claimStatus: "UNCLAIMED",
          revokedAt: null,
        },
        data: {
          ownerUserId: user.id,
          showOwnerInPublic: true,
          claimStatus: "ACTIVE",
          claimedAt,
          revokedAt: null,
        },
      });

      if (transition.count !== 1) {
        return null;
      }

      const claimedAgent = await tx.agent.findUnique({
        where: {
          id: credential.agent?.id,
        },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          points: true,
          showOwnerInPublic: true,
          ownerUserId: true,
          claimStatus: true,
          claimedAt: true,
        },
      });

      if (!claimedAgent) {
        throw new Error("Claimed agent not found after transition");
      }

      await tx.agentClaimAudit?.create({
        data: {
          agentId: claimedAgent.id,
          userId: user.id,
          action: "CLAIM",
          metadata: {
            source: "manual-api-key-claim",
          },
        },
      });

      await recordAgentActivity(
        {
          agentId: claimedAgent.id,
          type: "CREDENTIAL_CLAIMED",
          summary: "activity.credential.claimed",
          metadata: { userId: user.id },
        },
        tx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
      );

      return claimedAgent;
    });

    if (!updated) {
      return Response.json(
        { success: false, error: "Agent has already been claimed" },
        { status: 409 }
      );
    }

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
