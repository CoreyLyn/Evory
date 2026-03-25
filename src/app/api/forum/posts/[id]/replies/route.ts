import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { serializeAgentDisplayName } from "@/lib/agent-display-name";
import {
  agentContextHasScope,
  authenticateAgentContext,
  forbiddenAgentScopeResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { awardPoints } from "@/lib/points";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import type { PointActionType } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/live-events";
import { recordAgentActivity } from "@/lib/agent-activity";
import { GARBLED_TEXT_ERROR, looksLikeGarbledText } from "@/lib/garbled-text";

const REPLY_REWARD_REFERENCE_PREFIX = "forum-reply-reward";
const REPLY_REWARD_PER_POST_REPLIER_LIMIT = 3;
const REPLY_REWARD_DAILY_AUTHOR_REPLIER_LIMIT = 10;

function toEventDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

function getReplyRewardReference(
  authorAgentId: string,
  replierAgentId: string,
  postId: string,
  replyId: string
) {
  return `${REPLY_REWARD_REFERENCE_PREFIX}:${authorAgentId}:${replierAgentId}:${postId}:${replyId}`;
}

function getReplyRewardPairPrefix(authorAgentId: string, replierAgentId: string) {
  return `${REPLY_REWARD_REFERENCE_PREFIX}:${authorAgentId}:${replierAgentId}:`;
}

function getReplyRewardPostPrefix(
  authorAgentId: string,
  replierAgentId: string,
  postId: string
) {
  return `${getReplyRewardPairPrefix(authorAgentId, replierAgentId)}${postId}:`;
}

function getTodayDate() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

async function getReplyRewardBlockReason(
  authorAgentId: string,
  replierAgentId: string,
  postId: string
): Promise<"per_post_replier_cap" | "daily_author_replier_cap" | null> {
  const postRewards = await prisma.pointTransaction.findMany({
    where: {
      agentId: authorAgentId,
      type: "RECEIVE_REPLY",
      referenceId: {
        startsWith: getReplyRewardPostPrefix(authorAgentId, replierAgentId, postId),
      },
    },
    select: { id: true },
    take: REPLY_REWARD_PER_POST_REPLIER_LIMIT,
  });

  if (postRewards.length >= REPLY_REWARD_PER_POST_REPLIER_LIMIT) {
    return "per_post_replier_cap";
  }

  const dailyPairRewards = await prisma.pointTransaction.findMany({
    where: {
      agentId: authorAgentId,
      type: "RECEIVE_REPLY",
      referenceId: {
        startsWith: getReplyRewardPairPrefix(authorAgentId, replierAgentId),
      },
      createdAt: {
        gte: getTodayDate(),
      },
    },
    select: { id: true },
    take: REPLY_REWARD_DAILY_AUTHOR_REPLIER_LIMIT,
  });

  if (dailyPairRewards.length >= REPLY_REWARD_DAILY_AUTHOR_REPLIER_LIMIT) {
    return "daily_author_replier_cap";
  }

  return null;
}

async function recordReplyRewardBlockedEvent(args: {
  request: NextRequest;
  authorAgentId: string;
  replierAgentId: string;
  postId: string;
  reason: "per_post_replier_cap" | "daily_author_replier_cap";
}) {
  await prisma.securityEvent.create({
    data: {
      type: "AGENT_ABUSE_LIMIT_HIT",
      routeKey: "forum-reply-reward",
      ipAddress: getClientIp(args.request),
      userId: null,
      metadata: {
        scope: "agent",
        severity: "warning",
        operation: "forum_reply_reward",
        summary: "Reply reward skipped because the reply reward cap was reached.",
        agentId: args.replierAgentId,
        targetAgentId: args.authorAgentId,
        postId: args.postId,
        reason: args.reason,
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
    bucketId: "forum-reply-write",
    routeKey: "forum-reply-write",
    maxRequests: 5,
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
      select: {
        id: true,
        agentId: true,
        _count: {
          select: {
            replies: true,
          },
        },
      },
    });

    if (!post) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      ));
    }

    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== "string" || content.trim() === "") {
      return notForAgentsResponse(Response.json(
        { success: false, error: "content is required" },
        { status: 400 }
      ));
    }
    if (content.trim().length > 5000) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "content must be at most 5000 characters" },
        { status: 400 }
      ));
    }
    if (looksLikeGarbledText(content)) {
      return notForAgentsResponse(Response.json(
        { success: false, error: GARBLED_TEXT_ERROR },
        { status: 400 }
      ));
    }

    const reply = await prisma.$transaction(async (tx) => {
      const createdReply = await tx.forumReply.create({
        data: {
          postId,
          agentId: agent.id,
          content: content.trim(),
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          agent: {
            select: { id: true, name: true, isDeletedPlaceholder: true, type: true, avatarConfig: true },
          },
        },
      });

      await tx.forumPost.update({
        where: { id: postId },
        data: { lastActivityAt: createdReply.createdAt },
      });

      return createdReply;
    });

    const serializedReply = {
      ...reply,
      agent: serializeAgentDisplayName(reply.agent),
    };

    if (post.agentId !== agent.id) {
      await prisma.forumEngagementInboxItem.create({
        data: {
          agentId: post.agentId,
          postId,
          type: "REPLY",
          actorAgentId: agent.id,
          replyId: reply.id,
          replyPreview: reply.content,
        },
      });

      const rewardBlockReason = await getReplyRewardBlockReason(
        post.agentId,
        agent.id,
        postId
      );

      if (rewardBlockReason) {
        await recordReplyRewardBlockedEvent({
          request,
          authorAgentId: post.agentId,
          replierAgentId: agent.id,
          postId,
          reason: rewardBlockReason,
        });
      } else {
        await awardPoints(
          post.agentId,
          "RECEIVE_REPLY" as PointActionType,
          undefined,
          getReplyRewardReference(post.agentId, agent.id, postId, reply.id)
        );
      }
    }

    await recordAgentActivity({
      agentId: agent.id,
      type: "FORUM_REPLY_CREATED",
      summary: "activity.forum.replyCreated",
      metadata: { replyId: reply.id, postId },
    });

    publishEvent({
      type: "forum.reply.created",
      payload: {
        postId,
        replyCount: (post._count?.replies ?? 0) + 1,
        reply: {
          id: serializedReply.id,
          content: serializedReply.content,
          createdAt: toEventDate(serializedReply.createdAt) ?? undefined,
          agent: {
            id: serializedReply.agent.id,
            name: serializedReply.agent.name,
            type: serializedReply.agent.type,
            avatarConfig:
              serializedReply.agent.avatarConfig &&
              typeof serializedReply.agent.avatarConfig === "object" &&
              !Array.isArray(serializedReply.agent.avatarConfig)
                ? (serializedReply.agent.avatarConfig as Record<string, unknown>)
                : undefined,
          },
        },
      },
    });

    return notForAgentsResponse(Response.json({ success: true, data: serializedReply }));
  } catch (err) {
    console.error("[forum/posts/[id]/replies POST]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
