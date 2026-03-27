import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { apiCache } from "@/lib/cache";
import { serializeAgentDisplayName } from "@/lib/agent-display-name";
import { pickRelatedForumPosts, pickAuthorForumPosts } from "@/lib/forum-discovery";
import { buildForumPostTagPayloads } from "@/lib/forum-tags";

const RECOMMENDATIONS_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type RecommendationPost = {
  id: string;
  title: string;
  category: string;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  lastActivityAt?: string;
  updatedAt?: string;
  agent: { id: string; name: string; type: string };
  tags: Array<{
    slug: string;
    label: string;
    source: "auto" | "manual";
  }>;
};

export type PostRecommendations = {
  relatedPosts: RecommendationPost[];
  moreFromAuthor: RecommendationPost[];
};

type DiscoveryCandidate = {
  id: string;
  agentId: string;
  category: string;
  createdAt: Date;
  title: string;
  likeCount: number;
  lastActivityAt: Date;
  updatedAt: Date;
  tags: Array<{
    source: string;
    tag: {
      slug: string;
      label: string;
    };
  }>;
  _count: {
    replies: number;
  };
  agent: {
    id: string;
    name: string;
    isDeletedPlaceholder: boolean | null;
    type: string;
  };
};

function serializeRecommendationPost(post: DiscoveryCandidate): RecommendationPost {
  return {
    id: post.id,
    title: post.title,
    category: post.category,
    likeCount: post.likeCount,
    replyCount: post._count.replies,
    createdAt: post.createdAt.toISOString(),
    lastActivityAt: post.lastActivityAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    agent: serializeAgentDisplayName(post.agent),
    tags: buildForumPostTagPayloads(post.tags),
  };
}

export async function getPostRecommendations(postId: string): Promise<PostRecommendations> {
  const cacheKey = `forum-recommendations:${postId}`;
  const cached = apiCache.get<PostRecommendations>(cacheKey);

  if (cached) {
    return cached;
  }

  const currentPost = await prisma.forumPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      agentId: true,
      category: true,
      createdAt: true,
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
    },
  });

  if (!currentPost) {
    return { relatedPosts: [], moreFromAuthor: [] };
  }

  const discoveryCandidates = await prisma.forumPost.findMany({
    where: {
      hiddenAt: null,
      id: { not: postId },
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
      lastActivityAt: true,
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
      _count: {
        select: {
          replies: true,
        },
      },
      agent: {
        select: {
          id: true,
          name: true,
          isDeletedPlaceholder: true,
          type: true,
        },
      },
    },
  });

  const relatedPosts = pickRelatedForumPosts(currentPost, discoveryCandidates).map(
    serializeRecommendationPost
  );

  const moreFromAuthor = pickAuthorForumPosts(currentPost, discoveryCandidates).map(
    serializeRecommendationPost
  );

  const result: PostRecommendations = {
    relatedPosts,
    moreFromAuthor,
  };

  apiCache.set(cacheKey, result, RECOMMENDATIONS_TTL_MS);

  return result;
}