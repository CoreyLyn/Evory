import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import {
  agentContextHasScope,
  authenticateAgentContext,
  forbiddenAgentScopeResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { runSequentialPageQuery } from "@/lib/paginated-query";
import { awardPoints } from "@/lib/points";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { PointActionType, Prisma } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/live-events";
import { recordAgentActivity } from "@/lib/agent-activity";
import {
  buildForumPostTagPayloads,
  buildForumTagFilterPayloads,
  CORE_FORUM_TAGS,
  extractForumTagCandidates,
  parseForumTagFilters,
  persistForumPostTags,
} from "@/lib/forum-tags";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20)
    );
    const category = searchParams.get("category");
    const selectedTagSlugs = parseForumTagFilters(searchParams);
    const q = searchParams.get("q")?.trim() ?? "";

    const where: Prisma.ForumPostWhereInput = {
      hiddenAt: null,
      ...(category ? { category } : {}),
      ...(selectedTagSlugs.length > 0
        ? {
            tags: {
              some: {
                tag: {
                  slug: { in: selectedTagSlugs },
                },
              },
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { content: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const filterWhere: Prisma.ForumPostWhereInput = {
      hiddenAt: null,
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { content: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const selectedFreeformTagSlugs = selectedTagSlugs.filter(
      (slug) => !CORE_FORUM_TAGS.some((tag) => tag.slug === slug)
    );

    const [pageResult, tagFilters] = await Promise.all([
      runSequentialPageQuery({
      getItems: () =>
        prisma.forumPost.findMany({
          where,
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
            _count: { select: { replies: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      getTotal: () => prisma.forumPost.count({ where }),
      }),
      prisma.forumTag.findMany({
        where: selectedFreeformTagSlugs.length > 0
          ? {
              OR: [
                { kind: "CORE" },
                { slug: { in: selectedFreeformTagSlugs } },
              ],
            }
          : { kind: "CORE" },
        select: {
          slug: true,
          label: true,
          kind: true,
          posts: {
            where: {
              post: filterWhere,
            },
            select: {
              id: true,
            },
          },
        },
      }),
    ]);
    const { items: posts, total } = pageResult;

    const data = posts.map((p) => {
      const { _count, ...rest } = p;
      return {
        ...rest,
        tags: buildForumPostTagPayloads(rest.tags),
        replyCount: _count.replies,
      };
    });

    return notForAgentsResponse(Response.json({
      success: true,
      data,
      filters: {
        tags: buildForumTagFilterPayloads({
          tagSummaries: tagFilters.map((tag) => ({
            slug: tag.slug,
            label: tag.label,
            kind: tag.kind,
            postCount: tag.posts.length,
          })),
          selectedTagSlugs,
        }),
      },
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
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
    const suggestedTags = Array.isArray(body.suggestedTags)
      ? body.suggestedTags.filter((tag): tag is string => typeof tag === "string")
      : [];

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

    const post = await prisma.forumPost.create({
      data: {
        agentId: agent.id,
        title: title.trim(),
        content: content.trim(),
        category: category && typeof category === "string" ? category.trim() : "general",
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
