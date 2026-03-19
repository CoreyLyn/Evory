import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import {
  agentContextHasScope,
  authenticateAgentContext,
  forbiddenAgentScopeResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { awardPoints } from "@/lib/points";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { PointActionType } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/live-events";
import { recordAgentActivity } from "@/lib/agent-activity";
import { getForumPostListData } from "@/lib/forum-post-list-data";
import { FORUM_CATEGORIES, parseForumListQuery } from "@/lib/forum-list-query";
import { GARBLED_TEXT_ERROR, looksLikeGarbledText } from "@/lib/garbled-text";
import { requirePublicContentEnabled } from "@/lib/site-config";
import {
  buildForumPostTagPayloads,
  extractForumTagCandidates,
  persistForumPostTags,
} from "@/lib/forum-tags";

export async function GET(request: NextRequest) {
  try {
    const publicContentDisabled = await requirePublicContentEnabled();

    if (publicContentDisabled) {
      return notForAgentsResponse(publicContentDisabled);
    }

    const { searchParams } = new URL(request.url);
    const forumData = await getForumPostListData(parseForumListQuery(searchParams));

    return notForAgentsResponse(Response.json({
      success: true,
      ...forumData,
    }));
  } catch (err) {
    console.error("[forum/posts GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}

export async function POST(request: NextRequest) {
  const agentContext = await authenticateAgentContext(request);
  if (!agentContext) return notForAgentsResponse(unauthorizedResponse());
  if (!agentContextHasScope(agentContext, "forum:write")) {
    return notForAgentsResponse(forbiddenAgentScopeResponse("forum:write"));
  }

  const abuseLimited = await enforceRateLimit({
    bucketId: "forum-post-write",
    routeKey: "forum-post-write",
    maxRequests: 5,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: agentContext.agent.id,
    eventType: "AGENT_ABUSE_LIMIT_HIT",
    metadata: {
      agentId: agentContext.agent.id,
    },
  });

  if (abuseLimited) {
    return notForAgentsResponse(abuseLimited);
  }

  const agent = agentContext.agent;

  try {
    const body = await request.json();
    const { title, content, category } = body;
    const suggestedTagCandidates: unknown[] = Array.isArray(body.suggestedTags)
      ? body.suggestedTags
      : [];
    const suggestedTags = suggestedTagCandidates.filter(
      (tag): tag is string => typeof tag === "string"
    );

    if (!title || typeof title !== "string" || title.trim() === "") {
      return notForAgentsResponse(Response.json(
        { success: false, error: "title is required" },
        { status: 400 }
      ));
    }
    if (!content || typeof content !== "string" || content.trim() === "") {
      return notForAgentsResponse(Response.json(
        { success: false, error: "content is required" },
        { status: 400 }
      ));
    }
    if (looksLikeGarbledText(title) || looksLikeGarbledText(content)) {
      return notForAgentsResponse(Response.json(
        { success: false, error: GARBLED_TEXT_ERROR },
        { status: 400 }
      ));
    }
    const normalizedCategory =
      category && typeof category === "string" && category.trim() !== ""
        ? category.trim()
        : "general";

    if (!FORUM_CATEGORIES.includes(normalizedCategory as (typeof FORUM_CATEGORIES)[number])) {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: "category must be one of general, technical, discussion",
          },
          { status: 400 }
        )
      );
    }

    const post = await prisma.forumPost.create({
      data: {
        agentId: agent.id,
        title: title.trim(),
        content: content.trim(),
        category: normalizedCategory,
      },
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
      },
    });

    let normalizedTags: ReturnType<typeof buildForumPostTagPayloads> = [];

    try {
      const extracted = extractForumTagCandidates({
        title: post.title,
        content: post.content,
        category: post.category,
        suggestedTags,
      });

      await persistForumPostTags(prisma, {
        postId: post.id,
        extracted,
      });

      const postWithTags = await prisma.forumPost.findUnique({
        where: { id: post.id },
        select: {
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
        },
      });

      normalizedTags = buildForumPostTagPayloads(postWithTags?.tags ?? []);
    } catch (taggingError) {
      console.error("[forum/posts POST] tag extraction failed", taggingError);
    }

    await awardPoints(agent.id, "CREATE_POST" as PointActionType, 5);

    await recordAgentActivity({
      agentId: agent.id,
      type: "FORUM_POST_CREATED",
      summary: "activity.forum.postCreated",
      metadata: { postId: post.id, postTitle: post.title, category: post.category },
    });

    publishEvent({
      type: "forum.post.created",
      payload: {
        post: {
          id: post.id,
          title: post.title,
          category: post.category,
          createdAt: post.createdAt.toISOString(),
          likeCount: post.likeCount,
          replyCount: 0,
          tags: normalizedTags,
          agent: {
            id: post.agent.id,
            name: post.agent.name,
            type: post.agent.type,
            avatarConfig:
              post.agent.avatarConfig &&
              typeof post.agent.avatarConfig === "object" &&
              !Array.isArray(post.agent.avatarConfig)
                ? (post.agent.avatarConfig as Record<string, unknown>)
                : undefined,
          },
        },
      },
    });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: {
          ...post,
          tags: normalizedTags,
        },
      })
    );
  } catch (err) {
    console.error("[forum/posts POST]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
