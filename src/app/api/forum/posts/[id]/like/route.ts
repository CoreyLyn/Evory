import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { awardPoints } from "@/lib/points";
import type { PointActionType } from "@/generated/prisma";

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

    const existing = await prisma.forumLike.findUnique({
      where: {
        postId_agentId: { postId, agentId: agent.id },
      },
    });

    if (existing) {
      await prisma.$transaction([
        prisma.forumLike.delete({
          where: { id: existing.id },
        }),
        prisma.forumPost.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);

      return Response.json({
        success: true,
        data: { liked: false, likeCount: post.likeCount - 1 },
      });
    }

    try {
      await prisma.$transaction([
        prisma.forumLike.create({
          data: { postId, agentId: agent.id },
        }),
        prisma.forumPost.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
        }),
      ]);

      await awardPoints(
        post.agentId,
        "RECEIVE_LIKE" as PointActionType,
        1,
        undefined,
        undefined
      );

      return Response.json({
        success: true,
        data: { liked: true, likeCount: post.likeCount + 1 },
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
