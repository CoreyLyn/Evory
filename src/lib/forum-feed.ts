type ForumPostTagRecord = {
  kind?: string | null;
  tag?: {
    kind?: string | null;
  } | null;
};

type ForumPostRecord = {
  id: string;
  category?: string | null;
  content?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  featuredOverride?: boolean | null;
  likeCount?: number | null;
  replyCount?: number | null;
  viewCount?: number | null;
  tags?: ForumPostTagRecord[] | null;
  _count?: {
    replies?: number | null;
  } | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FEATURED_WINDOW_DAYS = 14;
const MIN_CONTENT_LENGTH = 280;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function normalizeTagKind(kind: string | null | undefined): string | null {
  if (!kind) {
    return null;
  }

  return kind.trim().toUpperCase();
}

function getTagKind(tagRecord: ForumPostTagRecord): string | null {
  return normalizeTagKind(tagRecord.tag?.kind ?? tagRecord.kind);
}

function hasCoreTag(post: ForumPostRecord): boolean {
  return (post.tags ?? []).some((relation) => getTagKind(relation) === "CORE");
}

function getPublicationDate(post: ForumPostRecord): Date | null {
  return toDate(post.createdAt);
}

function getContentLength(post: ForumPostRecord): number {
  return (post.content ?? "").trim().length;
}

function getAgeInDays(now: Date, publishedAt: Date): number {
  return (now.getTime() - publishedAt.getTime()) / MS_PER_DAY;
}

function getReplyCount(post: ForumPostRecord): number {
  return post.replyCount ?? post._count?.replies ?? 0;
}

export function scoreForumFeaturedCandidate(
  post: ForumPostRecord,
  now: Date
): number {
  const publicationDate = getPublicationDate(post);

  if (!publicationDate) {
    return Number.NEGATIVE_INFINITY;
  }

  const ageInDays = getAgeInDays(now, publicationDate);

  if (ageInDays < 0 || ageInDays > FEATURED_WINDOW_DAYS) {
    return Number.NEGATIVE_INFINITY;
  }

  if (getContentLength(post) < MIN_CONTENT_LENGTH) {
    return Number.NEGATIVE_INFINITY;
  }

  if (!hasCoreTag(post)) {
    return Number.NEGATIVE_INFINITY;
  }

  const categoryBonus =
    post.category === "technical"
      ? 40
      : post.category === "discussion"
        ? 20
        : 0;
  const recencyBonus = Math.max(0, FEATURED_WINDOW_DAYS - ageInDays) * 10;
  const engagementBonus =
    (post.likeCount ?? 0) * 4 +
    getReplyCount(post) * 10 +
    Math.min(12, Math.floor((post.viewCount ?? 0) / 20));
  const lengthBonus = Math.min(50, getContentLength(post) / 20);
  const tagBonus = (post.tags ?? []).filter(
    (relation) => getTagKind(relation) === "CORE"
  ).length;

  return categoryBonus + recencyBonus + engagementBonus + lengthBonus + tagBonus;
}

type PickFeaturedForumPostIdsOptions = {
  now?: Date;
  limit?: number;
};

export function pickFeaturedForumPostIds(
  posts: ForumPostRecord[],
  { now = new Date(), limit = 2 }: PickFeaturedForumPostIdsOptions = {}
): string[] {
  const pickedIds: string[] = [];
  const seen = new Set<string>();
  const scoredCandidates: Array<{ id: string; score: number; index: number }> =
    [];

  posts.forEach((post, index) => {
    if (seen.has(post.id)) {
      return;
    }

    if (post.featuredOverride === false) {
      return;
    }

    if (post.featuredOverride === true) {
      pickedIds.push(post.id);
      seen.add(post.id);
      return;
    }

    const score = scoreForumFeaturedCandidate(post, now);

    if (score > Number.NEGATIVE_INFINITY) {
      scoredCandidates.push({ id: post.id, score, index });
    }
  });

  if (pickedIds.length >= limit) {
    return pickedIds.slice(0, limit);
  }

  scoredCandidates
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.index - right.index;
    })
    .forEach(({ id }) => {
      if (pickedIds.length < limit && !seen.has(id)) {
        pickedIds.push(id);
        seen.add(id);
      }
    });

  return pickedIds.slice(0, limit);
}
