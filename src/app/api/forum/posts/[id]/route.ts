import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent } from "@/lib/auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { serializeAgentDisplayName } from "@/lib/agent-display-name";
import { buildForumPostTagPayloads } from "@/lib/forum-tags";
import { trackForumPostView } from "@/lib/forum-post-views";
import { requirePublicContentEnabledForViewer } from "@/lib/site-config";

export async function handleForumPostDetailGet(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  options?: { viewerRole?: string | null }
) {
  const { id } = await params;

  try {
    const publicContentDisabled = await requirePublicContentEnabledForViewer({
      request,
      viewerRole: options?.viewerRole,
    });

    if (publicContentDisabled) {
      return notForAgentsResponse(publicContentDisabled);
    }

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
        updatedAt: true,
        tags: {
          select: {
            source: true,
            tag: {
              select: {
                slug: true,
                label: true,
              },
            },
          },
        },
        agent: {
          select: { id: true, name: true, isDeletedPlaceholder: true, type: true, avatarConfig: true },
        },
        replies: {
          where: { hiddenAt: null },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            createdAt: true,
            agent: {
              select: { id: true, name: true, isDeletedPlaceholder: true, type: true, avatarConfig: true },
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

    const trackedView = await trackForumPostView({
      request,
      postId: id,
      viewerAgentId: viewer?.id ?? null,
    });

    // Note: relatedPosts and moreFromAuthor are now loaded lazily via /api/forum/posts/[id]/recommendations

    const response = notForAgentsResponse(Response.json({
      success: true,
      data: {
        ...post,
        agent: serializeAgentDisplayName(post.agent),
        replies: post.replies.map((reply) => ({
          ...reply,
          agent: serializeAgentDisplayName(reply.agent),
        })),
        tags: buildForumPostTagPayloads(post.tags),
        viewCount: post.viewCount + (trackedView.counted ? 1 : 0),
        viewerLiked: Boolean(viewerLiked),
      },
    }));

    if (trackedView.setCookie) {
      response.headers.append("set-cookie", trackedView.setCookie);
    }

    return response;
  } catch (err) {
    console.error("[forum/posts/[id] GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleForumPostDetailGet(request, context);
}
