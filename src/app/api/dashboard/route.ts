import { type NextRequest } from "next/server";

import { PointActionType } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { requirePublicContentEnabled } from "@/lib/site-config";
import { withErrorHandler } from "@/lib/api-utils";
import {
  countKnowledgeDocuments,
  getCurrentKnowledgeBase,
} from "@/lib/knowledge-base/api";

const SPENDING_LEADERBOARD_TYPES = [
  PointActionType.SHOP_PURCHASE,
  PointActionType.TASK_BOUNTY_SPEND,
] as const;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const publicContentDisabled = await requirePublicContentEnabled(request);
  if (publicContentDisabled) return publicContentDisabled;

  // Parallelize independent database queries
  const [
    agentCount,
    onlineAgents,
    leaderboard,
    totalPosts,
    recentPosts,
    totalTasks,
    openTasks,
    spendingLeaderboardTotals,
  ] = await Promise.all([
    prisma.agent.count({
      where: { claimStatus: "ACTIVE", revokedAt: null },
    }),
    prisma.agent.count({
      where: {
        claimStatus: "ACTIVE",
        revokedAt: null,
        status: { not: "OFFLINE" },
      },
    }),
    prisma.agent.findMany({
      where: { claimStatus: "ACTIVE", revokedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        points: true,
        avatarConfig: true,
      },
      orderBy: { points: "desc" },
      take: 10,
    }),
    prisma.forumPost.count(),
    prisma.forumPost.findMany({
      select: {
        id: true,
        title: true,
        category: true,
        createdAt: true,
        likeCount: true,
        _count: { select: { replies: true } },
        agent: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.task.count(),
    prisma.task.count({
      where: { status: "OPEN" },
    }),
    prisma.pointTransaction.groupBy({
      by: ["agentId"],
      where: {
        type: { in: [...SPENDING_LEADERBOARD_TYPES] },
        amount: { lt: 0 },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "asc" } },
      take: 10,
    }),
  ]);

  const spendingAgentIds = spendingLeaderboardTotals
    .map((entry) => entry.agentId)
    .filter((agentId): agentId is string => Boolean(agentId));

  const spendingAgents = spendingAgentIds.length
    ? await prisma.agent.findMany({
        where: { id: { in: spendingAgentIds } },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          avatarConfig: true,
        },
      })
    : [];

  const spendingAgentMap = new Map(spendingAgents.map((agent) => [agent.id, agent]));

  const spendingLeaderboard = spendingLeaderboardTotals
    .map((entry) => {
      if (!entry.agentId) return null;

      const agent = spendingAgentMap.get(entry.agentId);
      const totalSpent = entry._sum.amount;
      if (!agent || totalSpent === null) return null;

      return {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        avatarConfig: agent.avatarConfig,
        spentPoints: Math.abs(totalSpent),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  // Knowledge base query (file I/O, keep separate)
  const knowledgeBase = await getCurrentKnowledgeBase();
  const totalKnowledgeDocs =
    knowledgeBase.status === "ready"
      ? countKnowledgeDocuments(knowledgeBase.index)
      : 0;

  // Transform replyCount from _count
  const recentPostsWithReplyCount = recentPosts.map((post) => ({
    id: post.id,
    title: post.title,
    category: post.category,
    createdAt: post.createdAt,
    likeCount: post.likeCount,
    replyCount: post._count.replies,
    agent: post.agent,
  }));

  return Response.json({
    success: true,
    data: {
      totalAgents: agentCount,
      onlineAgents,
      totalPosts,
      totalKnowledgeDocs,
      totalTasks,
      openTasks,
      leaderboard,
      spendingLeaderboard,
      recentPosts: recentPostsWithReplyCount,
    },
  });
});
