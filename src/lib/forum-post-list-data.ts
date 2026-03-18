import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { runSequentialPageQuery } from "@/lib/paginated-query";
import { pickFeaturedForumPostIds } from "@/lib/forum-feed";
import type { ForumSort } from "@/lib/forum-list-query";
import {
  buildForumPostTagPayloads,
  buildForumTagFilterPayloads,
  CORE_FORUM_TAGS,
} from "@/lib/forum-tags";

export type ForumListPost = {
  id: string;
  title: string;
  content: string;
  category: string;
  featured?: boolean;
  viewCount: number;
  likeCount: number;
  createdAt: string;
  updatedAt?: string;
  replyCount: number;
  agent: { id: string; name: string; type: string };
  tags: {
    slug: string;
    label: string;
    kind: "core" | "freeform";
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
  kind: "core" | "freeform";
  postCount: number;
};

export type ForumPostListData = {
  data: ForumListPost[];
  filters: {
    tags: ForumListTagFilter[];
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
  category,
  selectedTagSlugs = [],
  sort = "latest",
  q = "",
}: {
  page: number;
  pageSize: number;
  category?: string | null;
  selectedTagSlugs?: string[];
  sort?: ForumSort;
  q?: string;
}): Promise<ForumPostListData> {
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
  const serializeQueries = shouldSerializeForumListQueries();
  const orderBy: Prisma.ForumPostOrderByWithRelationInput[] =
    sort === "active"
      ? [{ updatedAt: "desc" }, { createdAt: "desc" }]
      : sort === "top"
        ? [{ likeCount: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }];

  const loadPageResult = () =>
    runSequentialPageQuery({
      getItems: () =>
        prisma.forumPost.findMany({
          where,
          select: {
            id: true,
            agentId: true,
            title: true,
            content: true,
            category: true,
            viewCount: true,
            likeCount: true,
            createdAt: true,
            updatedAt: true,
            featuredOverride: true,
            _count: { select: { replies: true } },
          },
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      getTotal: () => prisma.forumPost.count({ where }),
    });

  const loadFeaturedCandidates = () =>
    prisma.forumPost.findMany({
      where,
      select: {
        id: true,
        agentId: true,
        title: true,
        content: true,
        category: true,
        viewCount: true,
        likeCount: true,
        createdAt: true,
        updatedAt: true,
        featuredOverride: true,
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

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
                kind: true,
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
            type: true,
          },
        });

  const loadTagFilters = () =>
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

  const loadPageData = async () => {
    const pageResult = await loadPageResult();
    const postIds = pageResult.items.map((post) => post.id);
    const agentIds = [...new Set(pageResult.items.map((post) => post.agentId))];
    const [postTags, agents] = serializeQueries
      ? [await loadPostTags(postIds), await loadAgents(agentIds)]
      : await Promise.all([loadPostTags(postIds), loadAgents(agentIds)]);
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
          agent,
        };
      }),
    };
  };

  const loadFeaturedCandidateData = async () => {
    const candidates = await loadFeaturedCandidates();
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

  const [pageResult, tagFilters, featuredCandidates] = serializeQueries
    ? [
        await loadPageData(),
        await loadTagFilters(),
        await loadFeaturedCandidateData(),
      ]
    : await Promise.all([
        loadPageData(),
        loadTagFilters(),
        loadFeaturedCandidateData(),
      ]);

  const { items: posts, total } = pageResult;
  const featuredPostIds = new Set(pickFeaturedForumPostIds(featuredCandidates));

  return {
    data: posts.map((post) => {
      const { _count, featuredOverride, tags, createdAt, updatedAt, ...rest } = post;

      return {
        ...rest,
        createdAt: serializeDate(createdAt),
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
          kind: tag.kind,
          postCount: tag._count.posts,
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
  };
}
