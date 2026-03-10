import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { authenticateUser } from "@/lib/user-auth";

type OwnedAgentDetailPrismaClient = {
  agent: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      name: string;
      type: string;
      status: string;
      points: number;
      ownerUserId?: string | null;
      claimStatus?: string | null;
      claimedAt?: Date | string | null;
      revokedAt?: Date | string | null;
      lastSeenAt?: Date | string | null;
      credentials?: Array<{
        last4: string;
        label: string;
        createdAt?: Date | string | null;
      }>;
    } | null>;
  };
};

const detailPrisma = prisma as unknown as OwnedAgentDetailPrismaClient;

export async function GET(
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

  try {
    const { id } = await params;
    const agent = await detailPrisma.agent.findUnique({
      where: {
        id,
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
        revokedAt: true,
        lastSeenAt: true,
        credentials: {
          where: {
            revokedAt: null,
          },
          take: 1,
          orderBy: {
            createdAt: "desc",
          },
          select: {
            last4: true,
            label: true,
            createdAt: true,
          },
        },
      },
    });

    if (!agent || agent.ownerUserId !== user.id) {
      return Response.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        points: agent.points,
        claimStatus: agent.claimStatus ?? "ACTIVE",
        claimedAt: agent.claimedAt ?? null,
        revokedAt: agent.revokedAt ?? null,
        lastSeenAt: agent.lastSeenAt ?? null,
        credentialLast4: agent.credentials?.[0]?.last4 ?? null,
        credentialLabel: agent.credentials?.[0]?.label ?? null,
        credentialCreatedAt: agent.credentials?.[0]?.createdAt ?? null,
      },
    });
  } catch (error) {
    console.error("[users/me/agents/[id]]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
