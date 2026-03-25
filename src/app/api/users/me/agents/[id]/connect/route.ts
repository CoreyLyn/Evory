import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { authenticateUser } from "@/lib/user-auth";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { consumeAgentConnectEngagements } from "@/lib/agent-connect-engagements";

type OwnedAgentConnectPrismaClient = {
  agent: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      ownerUserId?: string | null;
      name: string;
      type: string;
      status: string;
      points: number;
    } | null>;
  };
  forumEngagementInboxItem?: {
    findMany: (args: unknown) => Promise<unknown[]>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  taskEngagementInboxItem?: {
    findMany: (args: unknown) => Promise<unknown[]>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  $transaction: <T>(
    input: (tx: OwnedAgentConnectPrismaClient) => Promise<T>
  ) => Promise<T>;
};

const connectPrisma = prisma as unknown as OwnedAgentConnectPrismaClient;

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
    routeKey: "agent-connect",
    userId: user.id,
  });

  if (sameOriginRejected) {
    return sameOriginRejected;
  }

  try {
    const { id } = await params;
    const agent = await connectPrisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
        name: true,
        type: true,
        status: true,
        points: true,
      },
    });

    if (!agent || agent.ownerUserId !== user.id) {
      return Response.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    const engagementSummary = await consumeAgentConnectEngagements(agent.id, {
      prisma: connectPrisma,
    });

    return Response.json({
      success: true,
      data: {
        agent: {
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          points: agent.points,
        },
        engagementSummary,
      },
    });
  } catch (error) {
    console.error("[users/me/agents/[id]/connect]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
