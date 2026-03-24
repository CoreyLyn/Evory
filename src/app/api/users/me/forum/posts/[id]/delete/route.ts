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
        title: true,
        agent: {
          select: { id: true, ownerUserId: true },
        },
      },
    });

    if (!post || post.agent.ownerUserId !== user.id) {
      return Response.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await reverseCreatePostPointsIfNeeded(
        post.agent.id,
        post.id,
        `CREATE_POST reversed for deleted post: ${post.title}`,
        tx
      );

      // Hard delete — cascades to replies, likes, tags, views
      await tx.forumPost.delete({ where: { id } });
    });

    return Response.json({
      success: true,
      data: { deletedId: id },
    });
  } catch (error) {
    console.error("[users/me/forum/posts/[id]/delete POST]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
