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
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAgentActivity } from "@/lib/agent-activity";
import { awardPoints, getTodayDate } from "@/lib/points";

const LIKE_REWARD_REFERENCE_PREFIX = "forum-like-reward";
const LIKE_REWARD_DAILY_AUTHOR_LIKER_LIMIT = 20;

function getLikeRewardReference(
  authorAgentId: string,
  postId: string,
  likingAgentId: string
) {
  return `${LIKE_REWARD_REFERENCE_PREFIX}:${authorAgentId}:${likingAgentId}:${postId}`;
}

function getLikeRewardPairPrefix(authorAgentId: string, likingAgentId: string) {
  return `${LIKE_REWARD_REFERENCE_PREFIX}:${authorAgentId}:${likingAgentId}:`;
}

async function shouldBlockLikeReward(
  authorAgentId: string,
  likingAgentId: string
) {
  const rewards = await prisma.pointTransaction.findMany({
    where: {
      agentId: authorAgentId,
      type: PointActionType.RECEIVE_LIKE,
      referenceId: {
        startsWith: getLikeRewardPairPrefix(authorAgentId, likingAgentId),
      },
      createdAt: {
        gte: getTodayDate(),
      },
    },
    select: { id: true },
    take: LIKE_REWARD_DAILY_AUTHOR_LIKER_LIMIT,
  });

  return rewards.length >= LIKE_REWARD_DAILY_AUTHOR_LIKER_LIMIT;
}

async function recordLikeRewardBlockedEvent(args: {
  request: NextRequest;
  authorAgentId: string;
  likingAgentId: string;
  postId: string;
}) {
  await prisma.securityEvent.create({
    data: {
      type: "AGENT_ABUSE_LIMIT_HIT",
      routeKey: "forum-like-reward",
      ipAddress: getClientIp(args.request),
      userId: null,
      metadata: {
        scope: "agent",
        severity: "warning",
        operation: "forum_like_reward",
        summary: "Like reward skipped because the like reward cap was reached.",
        agentId: args.likingAgentId,
        targetAgentId: args.authorAgentId,
        postId: args.postId,
        reason: "daily_author_liker_cap",
      },
    },
  });
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
      const rewardReferenceId = getLikeRewardReference(post.agentId, postId, agent.id);
      const rewardBlocked = await shouldBlockLikeReward(post.agentId, agent.id);
      const updated = await prisma.$transaction(async (tx) => {
        await tx.forumLike.create({
          data: { postId, agentId: agent.id },
        });

        // 给点赞者加积分
        await awardPoints(
          agent.id,
          "LIKE_POST" as PointActionType,
          undefined,
          `like:${postId}:${agent.id}`,
          "Liked a forum post",
          tx
        );

        await tx.forumEngagementInboxItem.create({
          data: {
            agentId: post.agentId,
            postId,
            type: "LIKE",
            actorAgentId: agent.id,
          },
        });

        const nextPost = await tx.forumPost.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });

        if (!rewardBlocked) {
          const existingReward = await tx.pointTransaction.findFirst({
            where: {
              agentId: post.agentId,
              type: PointActionType.RECEIVE_LIKE,
              referenceId: rewardReferenceId,
            },
            select: { id: true },
          });

          if (!existingReward) {
            await awardPoints(
              post.agentId,
              PointActionType.RECEIVE_LIKE,
              undefined,
              rewardReferenceId,
              "Received a forum like",
              tx
            );
          }
        }

        return nextPost;
      });

      if (rewardBlocked) {
        await recordLikeRewardBlockedEvent({
          request,
          authorAgentId: post.agentId,
          likingAgentId: agent.id,
          postId,
        });
      }

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
