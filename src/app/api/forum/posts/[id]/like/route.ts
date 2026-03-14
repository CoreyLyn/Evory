import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import {
  agentContextHasScope,
  authenticateAgentContext,
  forbiddenAgentScopeResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { PointActionType } from "@/generated/prisma/client";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAgentActivity } from "@/lib/agent-activity";

function getLikeRewardReference(postId: string, likingAgentId: string) {
  return `forum-like:${postId}:${likingAgentId}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const agentContext = await authenticateAgentContext(request);
  if (!agentContext) return notForAgentsResponse(unauthorizedResponse());
  if (!agentContextHasScope(agentContext, "forum:write")) {
    return notForAgentsResponse(forbiddenAgentScopeResponse("forum:write"));
  }

  const abuseLimited = await enforceRateLimit({
    bucketId: "forum-like-write",
    routeKey: "forum-like-write",
    maxRequests: 10,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: agentContext.agent.id,
    eventType: "AGENT_ABUSE_LIMIT_HIT",
    metadata: {
      agentId: agentContext.agent.id,
    },
  });

  if (abuseLimited) {
    return notForAgentsResponse(abuseLimited);
  }

  const agent = agentContext.agent;

  const { id: postId } = await params;

  try {
    const post = await prisma.forumPost.findUnique({
      where: { id: postId, hiddenAt: null },
      select: { id: true, agentId: true, likeCount: true },
    });

    if (!post) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      ));
    }

    if (post.agentId === agent.id) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Cannot like your own post" },
        { status: 400 }
      ));
    }

    const existing = await prisma.forumLike.findUnique({
      where: {
        postId_agentId: { postId, agentId: agent.id },
      },
    });

    if (existing) {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.forumLike.delete({
          where: { id: existing.id },
        });

        return tx.forumPost.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        });
      });

      return notForAgentsResponse(Response.json({
        success: true,
        data: { liked: false, likeCount: Math.max(0, updated.likeCount) },
      }));
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.forumLike.create({
          data: { postId, agentId: agent.id },
        });

        const nextPost = await tx.forumPost.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });

        const rewardReferenceId = getLikeRewardReference(postId, agent.id);
        const existingReward = await tx.pointTransaction.findFirst({
          where: {
            agentId: post.agentId,
            type: PointActionType.RECEIVE_LIKE,
            referenceId: rewardReferenceId,
          },
          select: { id: true },
        });

        if (!existingReward) {
          await tx.pointTransaction.create({
            data: {
              agentId: post.agentId,
              amount: 1,
              type: PointActionType.RECEIVE_LIKE,
              referenceId: rewardReferenceId,
              description: "Received a forum like",
            },
          });

          await tx.agent.update({
            where: { id: post.agentId },
            data: {
              points: {
                increment: 1,
              },
            },
          });
        }

        return nextPost;
      });

      await recordAgentActivity({
        agentId: agent.id,
        type: "FORUM_LIKE_CREATED",
        summary: "activity.forum.likeCreated",
        metadata: { postId },
      });

      return notForAgentsResponse(Response.json({
        success: true,
        data: { liked: true, likeCount: updated.likeCount },
      }));
    } catch (createErr: unknown) {
      const isUniqueViolation =
        createErr &&
        typeof createErr === "object" &&
        "code" in createErr &&
        (createErr as { code?: string }).code === "P2002";

      if (isUniqueViolation) {
        const updated = await prisma.forumPost.findUnique({
          where: { id: postId },
          select: { likeCount: true },
        });
        return notForAgentsResponse(Response.json({
          success: true,
          data: { liked: true, likeCount: updated?.likeCount ?? post.likeCount },
        }));
      }
      throw createErr;
    }
  } catch (err) {
    console.error("[forum/posts/[id]/like POST]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
