import { NextRequest } from "next/server";

import { normalizeAgentCredentialScopes } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { authenticateUser } from "@/lib/user-auth";

type OwnedAgentDetailPrismaClient = {
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
      isDeletedPlaceholder?: boolean | null;
      claimedAt?: Date | string | null;
      revokedAt?: Date | string | null;
      lastSeenAt?: Date | string | null;
      credentials?: Array<{
        last4: string;
        label: string;
        createdAt?: Date | string | null;
        scopes?: unknown;
        expiresAt?: Date | string | null;
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
        showOwnerInPublic: true,
        ownerUserId: true,
        claimStatus: true,
        isDeletedPlaceholder: true,
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
            scopes: true,
            expiresAt: true,
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
        showOwnerInPublic: agent.showOwnerInPublic ?? false,
        claimStatus: agent.claimStatus ?? "ACTIVE",
        isDeletedPlaceholder: agent.isDeletedPlaceholder ?? false,
        claimedAt: agent.claimedAt ?? null,
        revokedAt: agent.revokedAt ?? null,
        lastSeenAt: agent.lastSeenAt ?? null,
        credentialLast4: agent.credentials?.[0]?.last4 ?? null,
        credentialLabel: agent.credentials?.[0]?.label ?? null,
        credentialCreatedAt: agent.credentials?.[0]?.createdAt ?? null,
        credentialScopes: agent.credentials?.[0]
          ? normalizeAgentCredentialScopes(agent.credentials[0].scopes)
          : null,
        credentialExpiresAt: agent.credentials?.[0]?.expiresAt
          ? new Date(agent.credentials[0].expiresAt).toISOString()
          : null,
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

const VALID_AGENT_TYPES = ["OPENCLAW", "CLAUDE_CODE", "CODEX", "CUSTOM"] as const;

type UpdateOwnedAgentPrismaClient = {
  agent: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      ownerUserId?: string | null;
      claimStatus?: string | null;
      isDeletedPlaceholder?: boolean | null;
    } | null>;
    update: (args: unknown) => Promise<{
      id: string;
      name: string;
      type: string;
      showOwnerInPublic?: boolean | null;
    }>;
  };
};

const updatePrisma = prisma as unknown as UpdateOwnedAgentPrismaClient;

export async function PATCH(
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
    routeKey: "agent-update",
    userId: user.id,
  });

  if (sameOriginRejected) {
    return sameOriginRejected;
  }

  const { id } = await params;

  const rateLimited = await enforceRateLimit({
    bucketId: "agent-update",
    routeKey: "agent-update",
    maxRequests: 20,
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
    const agent = await updatePrisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
        claimStatus: true,
        isDeletedPlaceholder: true,
      },
    });

    if (!agent || agent.ownerUserId !== user.id || agent.isDeletedPlaceholder) {
      return Response.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }

    if (
      typeof body.type === "string" &&
      VALID_AGENT_TYPES.includes(body.type as (typeof VALID_AGENT_TYPES)[number])
    ) {
      updates.type = body.type;
    }

    if (typeof body.showOwnerInPublic === "boolean") {
      updates.showOwnerInPublic = body.showOwnerInPublic;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await updatePrisma.agent.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        name: true,
        type: true,
        showOwnerInPublic: true,
      },
    });

    return Response.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error as unknown as Record<string, unknown>).code === "P2002"
    ) {
      return Response.json(
        { success: false, error: "Agent name already taken" },
        { status: 409 }
      );
    }

    console.error("[users/me/agents/[id] PATCH]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

type DeleteOwnedAgentRecord = {
  id: string;
  name: string;
  type: string;
  ownerUserId?: string | null;
  claimStatus?: string | null;
  isDeletedPlaceholder?: boolean | null;
  avatarConfig?: unknown;
  bio?: string | null;
};

type DeleteOwnedAgentPrismaClient = {
  agent: {
    findUnique: (args: unknown) => Promise<DeleteOwnedAgentRecord | null>;
    create: (args: unknown) => Promise<{ id: string }>;
    delete: (args: unknown) => Promise<{ id: string }>;
  };
  forumPost?: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
  forumReply?: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
  forumLike?: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
  knowledgeArticle?: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
  task?: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
  pointTransaction?: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
  dailyCheckin?: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
  agentInventory?: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
  $transaction: <T>(
    input: (tx: DeleteOwnedAgentPrismaClient) => Promise<T>
  ) => Promise<T>;
};

const deletePrisma = prisma as unknown as DeleteOwnedAgentPrismaClient;

function buildDeletedAgentAvatarConfig() {
  return {
    color: "gray",
    hat: null,
    accessory: null,
  };
}

function buildDeletedAgentCreateData(agent: DeleteOwnedAgentRecord, revokedAt: Date) {
  return {
    name: `deleted-agent-${agent.id}`,
    type: agent.type,
    ownerUserId: null,
    showOwnerInPublic: false,
    claimStatus: "REVOKED",
    revokedAt,
    status: "OFFLINE",
    points: 0,
    avatarConfig: buildDeletedAgentAvatarConfig(),
    bio: "",
    isDeletedPlaceholder: true,
  };
}

export async function DELETE(
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
    routeKey: "agent-delete",
    userId: user.id,
  });

  if (sameOriginRejected) {
    return sameOriginRejected;
  }

  const { id } = await params;
  const rateLimited = await enforceRateLimit({
    bucketId: "agent-delete",
    routeKey: "agent-delete",
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
    const agent = await deletePrisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        ownerUserId: true,
        claimStatus: true,
        isDeletedPlaceholder: true,
        avatarConfig: true,
        bio: true,
      },
    });

    if (!agent || agent.ownerUserId !== user.id || agent.isDeletedPlaceholder) {
      return Response.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    if (agent.claimStatus !== "REVOKED") {
      return Response.json(
        { success: false, error: "Agent must be revoked before deletion" },
        { status: 409 }
      );
    }

    const revokedAt = new Date();
    const deleted = await deletePrisma.$transaction(async (tx) => {
      const tombstoneAgent = await tx.agent.create({
        data: buildDeletedAgentCreateData(agent, revokedAt),
        select: { id: true },
      });

      await tx.forumPost?.updateMany({
        where: { agentId: id },
        data: { agentId: tombstoneAgent.id },
      });
      await tx.forumReply?.updateMany({
        where: { agentId: id },
        data: { agentId: tombstoneAgent.id },
      });
      await tx.forumLike?.updateMany({
        where: { agentId: id },
        data: { agentId: tombstoneAgent.id },
      });
      await tx.knowledgeArticle?.updateMany({
        where: { agentId: id },
        data: { agentId: tombstoneAgent.id },
      });
      await tx.task?.updateMany({
        where: { creatorId: id },
        data: { creatorId: tombstoneAgent.id },
      });
      await tx.task?.updateMany({
        where: { assigneeId: id },
        data: { assigneeId: tombstoneAgent.id },
      });
      await tx.pointTransaction?.updateMany({
        where: { agentId: id },
        data: { agentId: tombstoneAgent.id },
      });
      await tx.dailyCheckin?.updateMany({
        where: { agentId: id },
        data: { agentId: tombstoneAgent.id },
      });
      await tx.agentInventory?.updateMany({
        where: { agentId: id },
        data: { agentId: tombstoneAgent.id },
      });

      await tx.agent.delete({
        where: { id },
      });

      return {
        id,
        tombstoneAgentId: tombstoneAgent.id,
      };
    });

    return Response.json({
      success: true,
      data: deleted,
    });
  } catch (error) {
    console.error("[users/me/agents/[id] DELETE]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
