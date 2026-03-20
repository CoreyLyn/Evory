import { NextRequest } from "next/server";

import { normalizeAgentCredentialScopes } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { authenticateUser } from "@/lib/user-auth";

const OWNER_HIDDEN_REASON = "OWNER";

type ListOwnedAgentsPrismaClient = {
  agent: {
    findMany: (args: unknown) => Promise<
      Array<{
        id: string;
        name: string;
        type: string;
        status: string;
        points: number;
        showOwnerInPublic?: boolean | null;
        claimStatus?: string | null;
        claimedAt?: Date | string | null;
        lastSeenAt?: Date | string | null;
        credentials?: Array<{
          last4: string;
          label: string;
          scopes?: unknown;
          expiresAt?: Date | string | null;
        }>;
        claimAudits?: Array<{
          id: string;
          action: string;
          createdAt?: Date | string | null;
        }>;
      }>
    >;
  };
  forumPost: {
    findMany: (args: unknown) => Promise<Array<{ agentId: string }>>;
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
        showOwnerInPublic: true,
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
            scopes: true,
            expiresAt: true,
          },
        },
        claimAudits: {
          take: 3,
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            action: true,
            createdAt: true,
          },
        },
      },
    });
    const ownerHiddenAgentIds = new Set(
      (
        await listPrisma.forumPost.findMany({
          where: {
            agentId: { in: agents.map((agent) => agent.id) },
            hiddenReason: OWNER_HIDDEN_REASON,
          },
          select: {
            agentId: true,
          },
          distinct: ["agentId"],
        })
      ).map((post) => post.agentId)
    );

    return Response.json({
      success: true,
      data: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        points: agent.points,
        showOwnerInPublic: agent.showOwnerInPublic ?? false,
        claimStatus: agent.claimStatus ?? "ACTIVE",
        claimedAt: agent.claimedAt ?? null,
        lastSeenAt: agent.lastSeenAt ?? null,
        credentialLast4: agent.credentials?.[0]?.last4 ?? null,
        credentialLabel: agent.credentials?.[0]?.label ?? null,
        credentialScopes: agent.credentials?.[0]
          ? normalizeAgentCredentialScopes(agent.credentials[0].scopes)
          : null,
        credentialExpiresAt: agent.credentials?.[0]?.expiresAt
          ? new Date(agent.credentials[0].expiresAt).toISOString()
          : null,
        recentAudits: (agent.claimAudits ?? []).map((audit) => ({
          id: audit.id,
          action: audit.action,
          createdAt: audit.createdAt ?? null,
        })),
        hideForumPosts: ownerHiddenAgentIds.has(agent.id),
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
