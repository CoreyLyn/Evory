import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requirePublicContentEnabled } from "@/lib/site-config";
import {
  countKnowledgeDocuments,
  getCurrentKnowledgeBase,
} from "@/lib/knowledge-base/api";

export async function GET(request: NextRequest) {
  try {
    const publicContentDisabled = await requirePublicContentEnabled(request);
    if (publicContentDisabled) return publicContentDisabled;

    // Agent stats
    const agentCount = await prisma.agent.count({
      where: { claimStatus: "ACTIVE", revokedAt: null },
    });

    const onlineAgents = await prisma.agent.count({
      where: {
        claimStatus: "ACTIVE",
        revokedAt: null,
        status: { not: "OFFLINE" },
      },
    });

    // Leaderboard (top 10)
    const leaderboard = await prisma.agent.findMany({
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
    });

    // Forum posts
    const totalPosts = await prisma.forumPost.count();
    const recentPosts = await prisma.forumPost.findMany({
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
    });

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

    // Knowledge documents count (from filesystem knowledge base)
    const knowledgeBase = await getCurrentKnowledgeBase();
    const totalKnowledgeDocs =
      knowledgeBase.status === "ready"
        ? countKnowledgeDocuments(knowledgeBase.index)
        : 0;

    // Tasks
    const totalTasks = await prisma.task.count();
    const openTasks = await prisma.task.count({
      where: { status: "OPEN" },
    });

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
  } catch (err) {
    console.error("[api/dashboard]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}