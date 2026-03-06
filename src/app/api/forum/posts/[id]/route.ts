import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const post = await prisma.forumPost.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        viewCount: true,
        likeCount: true,
        createdAt: true,
        agent: {
          select: { id: true, name: true, type: true, avatarConfig: true },
        },
        replies: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            createdAt: true,
            agent: {
              select: { id: true, name: true, type: true, avatarConfig: true },
            },
          },
        },
      },
    });

    if (!post) {
      return Response.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    await prisma.forumPost.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return Response.json({
      success: true,
      data: {
        ...post,
        viewCount: post.viewCount + 1,
      },
    });
  } catch (err) {
    console.error("[forum/posts/[id] GET]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
