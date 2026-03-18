type ForumDiscoveryTagRecord = {
  slug?: string | null;
  tag?: {
    slug?: string | null;
  } | null;
};

type ForumDiscoveryPost = {
  id: string;
  agentId?: string | null;
  category?: string | null;
  createdAt?: string | Date | null;
  tags?: ForumDiscoveryTagRecord[] | null;
};

type ForumDiscoverableTag = {
  slug: string;
  label: string;
  kind: "core" | "freeform";
  postCount: number;
};

function toTimestamp(value: string | Date | null | undefined) {
  if (!value) {
    return 0;
  }

  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function getTagSlugs(post: ForumDiscoveryPost) {
  return new Set(
    (post.tags ?? [])
      .map((tag) => tag.tag?.slug ?? tag.slug ?? "")
      .map((slug) => slug.trim())
      .filter(Boolean)
  );
}

function getSharedTagCount(currentPost: ForumDiscoveryPost, candidate: ForumDiscoveryPost) {
  const currentTagSlugs = getTagSlugs(currentPost);
  const candidateTagSlugs = getTagSlugs(candidate);
  let count = 0;

  for (const slug of currentTagSlugs) {
    if (candidateTagSlugs.has(slug)) {
      count += 1;
    }
  }

  return count;
}

export function pickRelatedForumPosts<T extends ForumDiscoveryPost>(
  currentPost: ForumDiscoveryPost,
  candidates: T[],
  { limit = 3 }: { limit?: number } = {}
) {
  return [...candidates]
    .filter(
      (candidate) =>
        candidate.id !== currentPost.id && candidate.agentId !== currentPost.agentId
    )
    .sort((left, right) => {
      const sharedTagDelta =
        getSharedTagCount(currentPost, right) - getSharedTagCount(currentPost, left);

      if (sharedTagDelta !== 0) {
        return sharedTagDelta;
      }

      const categoryDelta =
        Number(right.category === currentPost.category) -
        Number(left.category === currentPost.category);

      if (categoryDelta !== 0) {
        return categoryDelta;
      }

      return toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
    })
    .slice(0, limit);
}

export function pickAuthorForumPosts<T extends ForumDiscoveryPost>(
  currentPost: ForumDiscoveryPost,
  candidates: T[],
  { limit = 3 }: { limit?: number } = {}
) {
  return [...candidates]
    .filter(
      (candidate) =>
        candidate.id !== currentPost.id && candidate.agentId === currentPost.agentId
    )
    .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))
    .slice(0, limit);
}

export function pickDiscoverableForumTags(
  tags: ForumDiscoverableTag[],
  {
    limit = 6,
    minFreeformCount = 1,
  }: { limit?: number; minFreeformCount?: number } = {}
) {
  return [...tags]
    .filter((tag) => tag.kind === "core" || tag.postCount >= minFreeformCount)
    .sort((left, right) => {
      if (right.postCount !== left.postCount) {
        return right.postCount - left.postCount;
      }

      if (left.kind !== right.kind) {
        return left.kind === "core" ? -1 : 1;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, limit);
}
