import {
  applyForumTagOverrides,
  type ForumTagOverrides,
  type ForumTagRecord,
} from "@/lib/forum-tag-overrides";

const FORUM_CATEGORY_SLUGS = new Set(["general", "technical", "discussion"]);
const FORUM_TAG_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "general",
  "issue",
  "post",
  "problem",
  "technical",
  "the",
  "thread",
  "update",
]);
const MAX_FORUM_TAGS_PER_POST = 5;
const MAX_FORUM_TAG_LABEL_LENGTH = 24;
const MAX_FORUM_TAG_WORD_COUNT = 4;
const MAX_FORUM_TAG_HAN_CHAR_COUNT = 12;
const FORUM_TAG_MAX_SLUG_LENGTH = 40;
const UPPERCASE_LATIN_TOKENS = new Set([
  "api",
  "ci",
  "cd",
  "db",
  "dns",
  "gql",
  "grpc",
  "html",
  "http",
  "https",
  "id",
  "ip",
  "jwt",
  "qa",
  "sql",
  "sse",
  "ssh",
  "tls",
  "ui",
  "url",
  "uri",
  "ux",
]);

type ForumTagSource = "auto" | "manual";

export type ForumTagPayload = {
  slug: string;
  label: string;
  source: ForumTagSource;
};

export type ForumTagFilterPayload = {
  slug: string;
  label: string;
  postCount: number;
};

type ForumTagFilterSummary = {
  slug: string;
  label: string;
  postCount: number;
};

export type EditableForumTagInput = {
  slug?: string;
  label?: string;
  kind?: string;
};

export type PersistedForumTag = {
  slug: string;
  label: string;
};

type PersistForumTagClient = {
  forumTag: {
    upsert: (args: {
      where: { slug: string };
      update: { label: string };
      create: {
        slug: string;
        label: string;
      };
    }) => Promise<{ id: string }>;
  };
  forumPostTag: {
    deleteMany?: (args: {
      where: {
        postId: string;
      };
    }) => Promise<unknown>;
    createMany: (args: {
      data: Array<{
        postId: string;
        tagId: string;
        source: "AUTO" | "MANUAL";
      }>;
      skipDuplicates: boolean;
    }) => Promise<unknown>;
  };
};

type ForumTagOverrideRow = {
  action: "ADD" | "REMOVE" | "LOCK";
  tag: ForumTagRecord;
};

type ForumTagRelationRecord = {
  source: string;
  tag: {
    slug: string;
    label: string;
  };
};

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueForumTagsBySlug<T extends { slug: string }>(tags: T[]) {
  return [...new Map(tags.map((tag) => [tag.slug, tag])).values()];
}

function isSentenceLikeForumTagLabel(label: string) {
  const words = label.split(/\s+/).filter(Boolean);
  const hanChars = (label.match(/\p{Script=Han}/gu) ?? []).length;

  return (
    label.length > MAX_FORUM_TAG_LABEL_LENGTH ||
    words.length > MAX_FORUM_TAG_WORD_COUNT ||
    hanChars > MAX_FORUM_TAG_HAN_CHAR_COUNT
  );
}

function normalizeLatinWord(token: string) {
  const lower = token.toLowerCase();

  if (UPPERCASE_LATIN_TOKENS.has(lower)) {
    return lower.toUpperCase();
  }

  if (/^\d+$/.test(token)) {
    return token;
  }

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function normalizeForumTagLabel(input: string) {
  const trimmed = input.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return "";
  }

  const normalizedSeparators = trimmed.replace(/[_-]+/g, " ");

  if (!/[A-Za-z]/.test(normalizedSeparators) || /\p{Script=Han}/u.test(normalizedSeparators)) {
    return normalizedSeparators;
  }

  return normalizedSeparators
    .split(/\s+/)
    .map((part) => (/^[A-Za-z0-9]+$/.test(part) ? normalizeLatinWord(part) : part))
    .join(" ");
}

function normalizeForumTagLabelFromSlug(slug: string) {
  return normalizeForumTagLabel(slug.replace(/-/g, " "));
}

function normalizeForumTagCandidate(input: string) {
  const label = normalizeForumTagLabel(input);

  if (!label || isSentenceLikeForumTagLabel(label)) {
    return null;
  }

  const slug = normalizeSlug(label);

  if (!slug || FORUM_CATEGORY_SLUGS.has(slug) || FORUM_TAG_STOP_WORDS.has(slug)) {
    return null;
  }

  return {
    slug: slug.slice(0, FORUM_TAG_MAX_SLUG_LENGTH).replace(/-+$/g, ""),
    label,
  };
}

function mapForumTagOverrideRows(
  overrideRows?: ForumTagOverrideRow[]
): Partial<ForumTagOverrides> | undefined {
  if (!overrideRows || overrideRows.length === 0) {
    return undefined;
  }

  const overrides: ForumTagOverrides = {
    add: [],
    remove: [],
    lock: [],
  };

  for (const row of overrideRows) {
    if (row.action === "REMOVE") {
      overrides.remove.push(row.tag.slug);
      continue;
    }

    if (row.action === "ADD") {
      overrides.add.push(row.tag);
      continue;
    }

    overrides.lock.push(row.tag);
  }

  return overrides;
}

export function parseForumTagFilters(searchParams: URLSearchParams): string[] {
  const merged = [
    searchParams.get("tag") ?? "",
    ...(searchParams.get("tags") ?? "").split(","),
  ];

  return [...new Set(
    merged
      .map((value) => normalizeSlug(value.trim()))
      .filter(Boolean)
  )];
}

export function normalizeForumFreeformTag(input: string) {
  return normalizeForumTagCandidate(input);
}

export function normalizeForumSuggestedTags(input: string[]): PersistedForumTag[] {
  const normalized: PersistedForumTag[] = [];
  const seen = new Set<string>();

  for (const rawTag of input) {
    const tag = normalizeForumTagCandidate(rawTag);

    if (!tag || seen.has(tag.slug)) {
      continue;
    }

    seen.add(tag.slug);
    normalized.push(tag);

    if (normalized.length >= MAX_FORUM_TAGS_PER_POST) {
      break;
    }
  }

  return normalized;
}

export function buildForumPostTagPayloads(tags: ForumTagRelationRecord[]) {
  return uniqueForumTagsBySlug(
    tags.map(({ source, tag }) => ({
      slug: tag.slug,
      label: tag.label,
      source: source.toLowerCase() as ForumTagSource,
    }))
  );
}

export function buildForumTagFilterPayloads(input: {
  tagSummaries: ForumTagFilterSummary[];
  selectedTagSlugs: string[];
}) {
  const filters = input.tagSummaries.map((tag) => ({
    slug: tag.slug,
    label: tag.label,
    postCount: tag.postCount,
  }));

  for (const slug of input.selectedTagSlugs) {
    if (filters.some((tag) => tag.slug === slug)) {
      continue;
    }

    filters.push({
      slug,
      label: normalizeForumTagLabelFromSlug(slug),
      postCount: 0,
    });
  }

  return [...filters].sort((left, right) => {
    if (right.postCount !== left.postCount) {
      return right.postCount - left.postCount;
    }

    return left.label.localeCompare(right.label);
  });
}

export function normalizeEditableForumTags(input: EditableForumTagInput[]) {
  const normalized: PersistedForumTag[] = [];
  const seen = new Set<string>();

  for (const candidate of input) {
    const source = (candidate.label?.trim() || candidate.slug?.trim() || "");
    const tag = normalizeForumTagCandidate(source);

    if (!tag || seen.has(tag.slug)) {
      continue;
    }

    seen.add(tag.slug);
    normalized.push(tag);
  }

  return normalized;
}

export async function rebuildForumPostTags(
  prismaClient: PersistForumTagClient,
  input: {
    postId: string;
    automaticTags: PersistedForumTag[];
    overrideRows?: ForumTagOverrideRow[];
  }
) {
  const autoTags = uniqueForumTagsBySlug(input.automaticTags);
  const overrides = mapForumTagOverrideRows(input.overrideRows);
  const { finalTags } = applyForumTagOverrides({
    autoTags,
    overrides,
  });
  const participatingTags = uniqueForumTagsBySlug([
    ...autoTags,
    ...(input.overrideRows?.map((row) => row.tag) ?? []),
  ]);
  const tagIdsBySlug = new Map<string, string>();

  await Promise.all(
    participatingTags.map(async (tag) => {
      const record = await prismaClient.forumTag.upsert({
        where: { slug: tag.slug },
        update: {
          label: tag.label,
        },
        create: {
          slug: tag.slug,
          label: tag.label,
        },
      });

      tagIdsBySlug.set(tag.slug, record.id);
    })
  );

  if (prismaClient.forumPostTag.deleteMany) {
    await prismaClient.forumPostTag.deleteMany({
      where: { postId: input.postId },
    });
  }

  if (finalTags.length === 0) {
    return;
  }

  await prismaClient.forumPostTag.createMany({
    data: finalTags.map((tag) => ({
      postId: input.postId,
      tagId: tagIdsBySlug.get(tag.slug)!,
      source: tag.source,
    })),
    skipDuplicates: true,
  });
}

export async function persistForumPostTags(
  prismaClient: PersistForumTagClient,
  input: {
    postId: string;
    tags: PersistedForumTag[];
    source?: "AUTO" | "MANUAL";
  }
) {
  const source = input.source ?? "AUTO";

  if (source === "AUTO") {
    await rebuildForumPostTags(prismaClient, {
      postId: input.postId,
      automaticTags: input.tags,
    });
    return;
  }

  const tags = uniqueForumTagsBySlug(input.tags);

  if (tags.length === 0) {
    return;
  }

  const tagIds = await Promise.all(
    tags.map(async (tag) => {
      const record = await prismaClient.forumTag.upsert({
        where: { slug: tag.slug },
        update: {
          label: tag.label,
        },
        create: {
          slug: tag.slug,
          label: tag.label,
        },
      });

      return record.id;
    })
  );

  await prismaClient.forumPostTag.createMany({
    data: tagIds.map((tagId) => ({
      postId: input.postId,
      tagId,
      source,
    })),
    skipDuplicates: true,
  });
}

export async function replaceForumPostTags(
  prismaClient: PersistForumTagClient,
  input: {
    postId: string;
    tags: PersistedForumTag[];
    source?: "AUTO" | "MANUAL";
  }
) {
  if (prismaClient.forumPostTag.deleteMany) {
    await prismaClient.forumPostTag.deleteMany({
      where: { postId: input.postId },
    });
  }

  await persistForumPostTags(prismaClient, {
    postId: input.postId,
    tags: input.tags,
    source: input.source ?? "MANUAL",
  });
}
