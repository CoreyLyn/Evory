import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { serializeAgentDisplayName } from "@/lib/agent-display-name";
import { runSequentialPageQuery } from "@/lib/paginated-query";
import { pickDiscoverableForumTags } from "@/lib/forum-discovery";
import { pickFeaturedForumPostIds } from "@/lib/forum-feed";
import type { ForumSort } from "@/lib/forum-list-query";
import {
  buildForumPostTagPayloads,
  buildForumTagFilterPayloads,
} from "@/lib/forum-tags";

// Type for the combined select result with nested relations
type PostWithRelations = {
  id: string;
  agentId: string;
  title: string;
  content: string;
  category: string;
  viewCount: number;
  likeCount: number;
  createdAt: Date;
  lastActivityAt: Date;
  updatedAt: Date;
  featuredOverride: boolean | null;
  _count: { replies: number };
  tags: Array<{
    source: string;
    tag: { slug: string; label: string };
  }>;
  agent: {
    id: string;
    name: string;
    isDeletedPlaceholder: boolean | null;
    type: string;
  };
};

export type ForumListPost = {
  id: string;
  title: string;
  content: string;
  category: string;
  featured?: boolean;
  viewCount: number;
  likeCount: number;
  createdAt: string;
  lastActivityAt: string;
  updatedAt?: string;
  replyCount: number;
  agent: { id: string; name: string; type: string };
  tags: {
    slug: string;
    label: string;
    source: "auto" | "manual";
  }[];
};

export type ForumListPagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ForumListTagFilter = {
  slug: string;
  label: string;
  postCount: number;
};

export type ForumPostListData = {
  data: ForumListPost[];
  filters: {
    tags: ForumListTagFilter[];
    discover: {
      popularTags: ForumListTagFilter[];
      activeTags: ForumListTagFilter[];
    };
  };
  context: {
    agent: ForumListPost["agent"] | null;
  };
  pagination: ForumListPagination;
};

function serializeDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export function shouldSerializeForumListQueries(databaseUrl = process.env.DATABASE_URL ?? "") {
  try {
    const parsedUrl = new URL(databaseUrl);
    return (
      parsedUrl.searchParams.get("connection_limit") === "1" ||
      parsedUrl.searchParams.get("single_use_connections") === "true"
    );
  } catch {
    return false;
  }
}

export async function getForumPostListData({
  page,
  pageSize,
  agentId,
  category,
  selectedTagSlugs = [],
  sort = "latest",
  q = "",
}: {
  page: number;
  pageSize: number;
  agentId?: string | null;
  category?: string | null;
  selectedTagSlugs?: string[];
  sort?: ForumSort;
  q?: string;
}): Promise<ForumPostListData> {
  const where: Prisma.ForumPostWhereInput = {
    hiddenAt: null,
    ...(agentId ? { agentId } : {}),
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
    ...(agentId ? { agentId } : {}),
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

  const serializeQueries = shouldSerializeForumListQueries();
  const orderBy: Prisma.ForumPostOrderByWithRelationInput[] =
    sort === "active"
      ? [{ lastActivityAt: "desc" }, { createdAt: "desc" }]
      : sort === "top"
        ? [{ likeCount: "desc" }, { lastActivityAt: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }];

  // Shared select object for posts with included relations
  const postSelect = {
    id: true,
    agentId: true,
    title: true,
    content: true,
    category: true,
    viewCount: true,
    likeCount: true,
    createdAt: true,
    lastActivityAt: true,
    updatedAt: true,
    featuredOverride: true,
    _count: { select: { replies: true } },
    // Include tags directly to avoid N+1 query
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
    // Include agent directly to avoid N+1 query
    agent: {
      select: {
        id: true,
        name: true,
        isDeletedPlaceholder: true,
        type: true,
      },
    },
  } as const;

  // Fallback select without nested relations for environments where combined selects fail
  const postSelectFallback = {
    id: true,
    agentId: true,
    title: true,
    content: true,
    category: true,
    viewCount: true,
    likeCount: true,
    createdAt: true,
    lastActivityAt: true,
    updatedAt: true,
    featuredOverride: true,
    _count: { select: { replies: true } },
  } as const;

  const loadPostTags = (postIds: string[]) =>
    postIds.length === 0
      ? Promise.resolve([])
      : prisma.forumPostTag.findMany({
          where: {
            postId: { in: postIds },
          },
          select: {
            postId: true,
            source: true,
            tag: {
              select: {
                slug: true,
                label: true,
              },
            },
          },
        });

  const loadAgents = (agentIds: string[]) =>
    agentIds.length === 0
      ? Promise.resolve([])
      : prisma.agent.findMany({
          where: {
            id: { in: agentIds },
          },
          select: {
            id: true,
            name: true,
            isDeletedPlaceholder: true,
            type: true,
          },
        });

  const loadPageResult = (useCombinedSelect: boolean) =>
    runSequentialPageQuery({
      getItems: () =>
        prisma.forumPost.findMany({
          where,
          select: useCombinedSelect ? postSelect : postSelectFallback,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      getTotal: () => prisma.forumPost.count({ where }),
    });

  const loadFeaturedCandidates = (useCombinedSelect: boolean) =>
    prisma.forumPost.findMany({
      where,
      select: useCombinedSelect ? postSelect : postSelectFallback,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

  const loadTagFilters = () =>
    prisma.forumTag.findMany({
      select: {
        slug: true,
        label: true,
        _count: {
          select: {
            posts: {
              where: {
                post: filterWhere,
              },
            },
          },
        },
      },
    });

  const loadContextAgent = () =>
    agentId
      ? prisma.agent.findMany({
          where: { id: { in: [agentId] } },
          select: {
            id: true,
            name: true,
            isDeletedPlaceholder: true,
            type: true,
          },
        })
      : Promise.resolve([]);

  const loadPageData = async (useCombinedSelect: boolean) => {
    const pageResult = await loadPageResult(useCombinedSelect);

    // Check if combined select returned the expected nested data
    const hasIncludedRelations = pageResult.items.length > 0 && "agent" in pageResult.items[0];

    if (useCombinedSelect && hasIncludedRelations) {
      // Tags and agent are already included in the query
      return {
        total: pageResult.total,
        items: (pageResult.items as PostWithRelations[]).map((post) => ({
          ...post,
          agent: serializeAgentDisplayName(post.agent),
        })),
      };
    }

    // Fallback: load tags and agents separately
    const postIds = pageResult.items.map((post) => post.id);
    const agentIds = [...new Set(pageResult.items.map((post) => post.agentId))];
    const requestedAgentIds = agentId ? [...new Set([...agentIds, agentId])] : agentIds;
    const [postTags, agents] = serializeQueries
      ? [await loadPostTags(postIds), await loadAgents(requestedAgentIds)]
      : await Promise.all([loadPostTags(postIds), loadAgents(requestedAgentIds)]);
    const tagsByPostId = new Map<string, typeof postTags>();

    for (const tag of postTags) {
      const tags = tagsByPostId.get(tag.postId) ?? [];
      tags.push(tag);
      tagsByPostId.set(tag.postId, tags);
    }

    const agentsById = new Map(agents.map((agent) => [agent.id, agent]));

    return {
      total: pageResult.total,
      items: pageResult.items.map((post) => {
        const agent = agentsById.get(post.agentId);

        if (!agent) {
          throw new Error(`Missing agent ${post.agentId} for forum post ${post.id}`);
        }

        return {
          ...post,
          tags: tagsByPostId.get(post.id) ?? [],
          agent: serializeAgentDisplayName(agent),
        };
      }),
    };
  };

  const loadFeaturedCandidateData = async (useCombinedSelect: boolean) => {
    const candidates = await loadFeaturedCandidates(useCombinedSelect);

    // Check if combined select returned the expected nested data
    const hasIncludedTags = candidates.length > 0 && "tags" in candidates[0];

    if (useCombinedSelect && hasIncludedTags) {
      // Tags are already included in the query
      return candidates;
    }

    // Fallback: load tags separately
    const candidateIds = candidates.map((post) => post.id);
    const candidateTags = await loadPostTags(candidateIds);
    const tagsByPostId = new Map<string, typeof candidateTags>();

    for (const tag of candidateTags) {
      const tags = tagsByPostId.get(tag.postId) ?? [];
      tags.push(tag);
      tagsByPostId.set(tag.postId, tags);
    }

    return candidates.map((post) => ({
      ...post,
      tags: tagsByPostId.get(post.id) ?? [],
    }));
  };

  // Try combined select first, fall back to separate queries on connection errors
  let useCombinedSelect = true;

  const tryLoadPageData = async () => {
    const currentUseCombinedSelect = useCombinedSelect;
    try {
      return await loadPageData(currentUseCombinedSelect);
    } catch (error) {
      const prismaError = error as { code?: string };
      // P1017 = Server has closed the connection (can happen with nested selects on some DB configs)
      if (currentUseCombinedSelect && prismaError.code === "P1017") {
        useCombinedSelect = false;
        return loadPageData(false);
      }
      throw error;
    }
  };

  const tryLoadFeaturedCandidateData = async () => {
    const currentUseCombinedSelect = useCombinedSelect;
    try {
      return await loadFeaturedCandidateData(currentUseCombinedSelect);
    } catch (error) {
      const prismaError = error as { code?: string };
      // P1017 = Server has closed the connection - retry with fallback select
      if (prismaError.code === "P1017") {
        useCombinedSelect = false;
        return loadFeaturedCandidateData(false);
      }
      throw error;
    }
  };

  const [pageResult, tagFilters, featuredCandidates, contextAgents] = serializeQueries
    ? [
        await tryLoadPageData(),
        await loadTagFilters(),
        await tryLoadFeaturedCandidateData(),
        await loadContextAgent(),
      ]
    : await Promise.all([
        tryLoadPageData(),
        loadTagFilters(),
        tryLoadFeaturedCandidateData(),
        loadContextAgent(),
      ]);

  const { items: posts, total } = pageResult;
  const featuredPostIds = new Set(pickFeaturedForumPostIds(featuredCandidates));

  const discoverableTags = pickDiscoverableForumTags(
    tagFilters.map((tag) => ({
      slug: tag.slug,
      label: tag.label,
      postCount: tag._count.posts,
    }))
  );
  const discoverTagPayloads = buildForumTagFilterPayloads({
    tagSummaries: discoverableTags.map((tag) => ({
      slug: tag.slug,
      label: tag.label,
      postCount: tag.postCount,
    })),
    selectedTagSlugs: [],
  });

  return {
    data: posts.map((post) => {
      const {
        _count,
        featuredOverride,
        tags,
        createdAt,
        lastActivityAt,
        updatedAt,
        ...rest
      } = post;
      void featuredOverride;

      return {
        ...rest,
        createdAt: serializeDate(createdAt),
        lastActivityAt: serializeDate(lastActivityAt),
        updatedAt: serializeDate(updatedAt),
        featured: featuredPostIds.has(post.id),
        tags: buildForumPostTagPayloads(tags),
        replyCount: _count.replies,
      };
    }),
    filters: {
      tags: buildForumTagFilterPayloads({
        tagSummaries: tagFilters.map((tag) => ({
          slug: tag.slug,
          label: tag.label,
          postCount: tag._count.posts,
        })),
        selectedTagSlugs,
      }),
      discover: {
        popularTags: discoverTagPayloads,
        activeTags: discoverTagPayloads,
      },
    },
    context: {
      agent: contextAgents[0] ? serializeAgentDisplayName(contextAgents[0]) : null,
    },
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
