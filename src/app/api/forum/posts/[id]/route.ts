import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent } from "@/lib/auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { pickAuthorForumPosts, pickRelatedForumPosts } from "@/lib/forum-discovery";
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
    const discoveryCandidates = await prisma.forumPost.findMany({
      where: {
        hiddenAt: null,
        id: { not: id },
      },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true,
        agentId: true,
        title: true,
        category: true,
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
                kind: true,
              },
            },
          },
        },
        agent: {
          select: { id: true, name: true, type: true },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
    });

    const trackedView = await trackForumPostView({
      request,
      postId: id,
      viewerAgentId: viewer?.id ?? null,
    });
    const currentPostForDiscovery = {
      id: post.id,
      agentId: post.agent.id,
      category: post.category,
      createdAt: post.createdAt,
      tags: post.tags,
    };
    const relatedPosts = pickRelatedForumPosts(currentPostForDiscovery, discoveryCandidates).map(
      ({ _count, tags, ...candidate }) => ({
        ...candidate,
        replyCount: _count.replies,
        tags: buildForumPostTagPayloads(tags),
      })
    );
    const moreFromAuthor = pickAuthorForumPosts(
      currentPostForDiscovery,
      discoveryCandidates
    ).map(({ _count, tags, ...candidate }) => ({
      ...candidate,
      replyCount: _count.replies,
      tags: buildForumPostTagPayloads(tags),
    }));

    const response = notForAgentsResponse(Response.json({
      success: true,
      data: {
        ...post,
        tags: buildForumPostTagPayloads(post.tags),
        viewCount: post.viewCount + (trackedView.counted ? 1 : 0),
        viewerLiked: Boolean(viewerLiked),
        relatedPosts,
        moreFromAuthor,
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
