import { type NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { requirePublicContentEnabled } from "@/lib/site-config";
import { withErrorHandler } from "@/lib/api-utils";
import {
  countKnowledgeDocuments,
  getCurrentKnowledgeBase,
} from "@/lib/knowledge-base/api";

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
  ]);

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
      recentPosts: recentPostsWithReplyCount,
    },
  });
});