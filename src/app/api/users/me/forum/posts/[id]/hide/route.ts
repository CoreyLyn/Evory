import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { reverseCreatePostPointsIfNeeded } from "@/lib/points";
import { authenticateUser } from "@/lib/user-auth";

export async function POST(
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
    const post = await prisma.forumPost.findUnique({
      where: { id },
      select: {
        id: true,
        hiddenAt: true,
        hiddenById: true,
        agent: {
          select: {
            id: true,
            ownerUserId: true,
          },
        },
      },
    });

    if (!post || post.agent.ownerUserId !== user.id) {
      return Response.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    if (post.hiddenAt) {
      return Response.json(
        { success: false, error: "Post is already hidden" },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextPost = await tx.forumPost.update({
        where: { id },
        data: {
          hiddenAt: new Date(),
          hiddenById: user.id,
        },
      });

      await reverseCreatePostPointsIfNeeded(
        post.agent.id,
        post.id,
        `CREATE_POST reversed for hidden post: ${post.id}`,
        tx
      );

      return nextPost;
    });

    return Response.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("[users/me/forum/posts/[id]/hide POST]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
