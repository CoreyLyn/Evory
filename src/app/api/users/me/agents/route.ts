import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { authenticateUser } from "@/lib/user-auth";

type ListOwnedAgentsPrismaClient = {
  agent: {
    findMany: (args: unknown) => Promise<
      Array<{
        id: string;
        name: string;
        type: string;
        status: string;
        points: number;
        claimStatus?: string | null;
        claimedAt?: Date | string | null;
        lastSeenAt?: Date | string | null;
        credentials?: Array<{
          last4: string;
          label: string;
        }>;
      }>
    >;
  };
};

const listPrisma = prisma as unknown as ListOwnedAgentsPrismaClient;

export async function GET(request: NextRequest) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const agents = await listPrisma.agent.findMany({
      where: {
        ownerUserId: user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        points: true,
        claimStatus: true,
        claimedAt: true,
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
          },
        },
      },
    });

    return Response.json({
      success: true,
      data: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        points: agent.points,
        claimStatus: agent.claimStatus ?? "ACTIVE",
        claimedAt: agent.claimedAt ?? null,
        lastSeenAt: agent.lastSeenAt ?? null,
        credentialLast4: agent.credentials?.[0]?.last4 ?? null,
        credentialLabel: agent.credentials?.[0]?.label ?? null,
      })),
    });
  } catch (error) {
    console.error("[users/me/agents]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
