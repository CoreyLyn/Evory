import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { runSequentialPageQuery } from "@/lib/paginated-query";
import { pickFeaturedForumPostIds } from "@/lib/forum-feed";
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
  q = "",
}: {
  page: number;
  pageSize: number;
  category?: string | null;
  selectedTagSlugs?: string[];
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

  const loadPageResult = () =>
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
            updatedAt: true,
            featuredOverride: true,
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

  const [pageResult, tagFilters] = shouldSerializeForumListQueries()
    ? [await loadPageResult(), await loadTagFilters()]
    : await Promise.all([loadPageResult(), loadTagFilters()]);

  const { items: posts, total } = pageResult;
  const featuredPostIds = new Set(pickFeaturedForumPostIds(posts));

  return {
    data: posts.map((post) => {
      const { _count, featuredOverride, ...rest } = post;

      return {
        ...rest,
        featured: featuredPostIds.has(post.id),
        tags: buildForumPostTagPayloads(rest.tags),
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
