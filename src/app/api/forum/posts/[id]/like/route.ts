import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { PointActionType } from "@/generated/prisma";

function getLikeRewardReference(postId: string, likingAgentId: string) {
  return `forum-like:${postId}:${likingAgentId}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);
  if (!agent) return unauthorizedResponse();

  const { id: postId } = await params;

  try {
    const post = await prisma.forumPost.findUnique({
      where: { id: postId },
      select: { id: true, agentId: true, likeCount: true },
    });

    if (!post) {
      return Response.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    if (post.agentId === agent.id) {
      return Response.json(
        { success: false, error: "Cannot like your own post" },
        { status: 400 }
      );
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

      return Response.json({
        success: true,
        data: { liked: false, likeCount: Math.max(0, updated.likeCount) },
      });
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

      return Response.json({
        success: true,
        data: { liked: true, likeCount: updated.likeCount },
      });
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
        return Response.json({
          success: true,
          data: { liked: true, likeCount: updated?.likeCount ?? post.likeCount },
        });
      }
      throw createErr;
    }
  } catch (err) {
    console.error("[forum/posts/[id]/like POST]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
