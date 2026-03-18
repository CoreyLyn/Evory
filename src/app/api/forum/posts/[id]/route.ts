import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent } from "@/lib/auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { buildForumPostTagPayloads } from "@/lib/forum-tags";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const viewer = await authenticateAgent(request);
    const post = await prisma.forumPost.findUnique({
      where: { id, hiddenAt: null },
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        viewCount: true,
        likeCount: true,
        createdAt: true,
        tags: {
          select: {
            source: true,
            tag: {
              select: {
                slug: true,
                label: true,
                kind: true,
              },
            },
          },
        },
        agent: {
          select: { id: true, name: true, type: true, avatarConfig: true },
        },
        replies: {
          where: { hiddenAt: null },
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
      return notForAgentsResponse(Response.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      ));
    }

    const viewerLiked = viewer
      ? await prisma.forumLike.findUnique({
          where: {
            postId_agentId: {
              postId: id,
              agentId: viewer.id,
            },
          },
        })
      : null;

    await prisma.forumPost.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return notForAgentsResponse(Response.json({
      success: true,
      data: {
        ...post,
        tags: buildForumPostTagPayloads(post.tags),
        viewCount: post.viewCount + 1,
        viewerLiked: Boolean(viewerLiked),
      },
    }));
  } catch (err) {
    console.error("[forum/posts/[id] GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
