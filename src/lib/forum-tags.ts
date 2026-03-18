export const CORE_FORUM_TAGS = [
  { slug: "frontend", label: "Frontend" },
  { slug: "backend", label: "Backend" },
  { slug: "database", label: "Database" },
  { slug: "api", label: "API" },
  { slug: "bugfix", label: "Bugfix" },
  { slug: "performance", label: "Performance" },
  { slug: "deployment", label: "Deployment" },
  { slug: "testing", label: "Testing" },
  { slug: "security", label: "Security" },
  { slug: "ux", label: "UX" },
] as const;

const FORUM_CATEGORY_SLUGS = new Set(["general", "technical", "discussion"]);
const FREEFORM_STOP_WORDS = new Set([
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

const CORE_TAG_KEYWORDS: Record<string, string[]> = {
  frontend: ["frontend", "ui", "client", "browser", "css", "react"],
  backend: ["backend", "server", "service"],
  database: ["database", "db", "postgres", "prisma", "sql"],
  api: ["api", "endpoint", "route", "http"],
  bugfix: ["bug", "bugfix", "fix", "error", "issue", "broken", "timeout"],
  performance: ["performance", "optimize", "optimization", "slow", "latency"],
  deployment: ["deploy", "deployment", "release", "ship", "rollout", "ci/cd", "ci cd"],
  testing: ["test", "testing", "coverage", "spec", "assert"],
  security: ["security", "csrf", "auth", "credential", "permission", "scope"],
  ux: ["ux", "user experience", "copy", "layout", "accessibility"],
};

type ForumTagKind = "core" | "freeform";
type ForumTagSource = "auto" | "manual";

export type ForumTagPayload = {
  slug: string;
  label: string;
  kind: ForumTagKind;
  source: ForumTagSource;
};

export type ForumTagFilterPayload = {
  slug: string;
  label: string;
  kind: ForumTagKind;
  postCount: number;
};

export type EditableForumTagInput = {
  slug?: string;
  label?: string;
  kind?: string;
};

export type ExtractForumTagCandidatesInput = {
  title: string;
  content: string;
  category: string;
};

export type ExtractForumTagCandidatesResult = {
  core: Array<{ slug: string; label: string }>;
  freeform: Array<{ slug: string; label: string }>;
};

type PersistForumTagClient = {
  forumTag: {
    upsert: (args: {
      where: { slug: string };
      update: { label: string; kind: "CORE" | "FREEFORM" };
      create: {
        slug: string;
        label: string;
        kind: "CORE" | "FREEFORM";
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

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toSearchableText(input: ExtractForumTagCandidatesInput) {
  return `${input.title} ${input.content} ${input.category}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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
  const label = input.trim().replace(/\s+/g, " ");
  if (!label) return null;

  const slug = normalizeSlug(label);

  if (
    !slug ||
    FORUM_CATEGORY_SLUGS.has(slug) ||
    FREEFORM_STOP_WORDS.has(slug)
  ) {
    return null;
  }

  return {
    slug: slug.slice(0, 40),
    label: label.slice(0, 40),
  };
}

export function extractForumTagCandidates(
  input: ExtractForumTagCandidatesInput
): ExtractForumTagCandidatesResult {
  const text = toSearchableText(input);
  const matchedCore = CORE_FORUM_TAGS.filter(({ slug }) =>
    CORE_TAG_KEYWORDS[slug].some((keyword) => text.includes(keyword))
  );

  const freeformPhrases = [
    ...input.title.split(/[-:,/]/),
    ...input.content.split(/[.!?\n]/),
  ]
    .map((part) => normalizeForumFreeformTag(part))
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .filter((value) => !matchedCore.some((core) => core.slug === value.slug));

  return {
    core: matchedCore,
    freeform: [...new Map(
      freeformPhrases.slice(0, 2).map((tag) => [tag.slug, tag])
    ).values()],
  };
}

export function sortForumTagPayloads(tags: ForumTagPayload[]) {
  return [...tags].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "core" ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });
}

type ForumTagRelationRecord = {
  source: string;
  tag: {
    slug: string;
    label: string;
    kind: string;
  };
};

export function buildForumPostTagPayloads(tags: ForumTagRelationRecord[]) {
  return sortForumTagPayloads(
    tags.map(({ source, tag }) => ({
      slug: tag.slug,
      label: tag.label,
      kind: tag.kind.toLowerCase() as ForumTagKind,
      source: source.toLowerCase() as ForumTagSource,
    }))
  );
}

export function buildForumTagFilterPayloads(selectedTagSlugs: string[]) {
  const filters = CORE_FORUM_TAGS.map((tag) => ({
    slug: tag.slug,
    label: tag.label,
    kind: "core" as const,
    postCount: 0,
  }));

  for (const slug of selectedTagSlugs) {
    if (filters.some((tag) => tag.slug === slug)) {
      continue;
    }

    filters.push({
      slug,
      label: slug
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      kind: "freeform",
      postCount: 0,
    });
  }

  return filters;
}

export function normalizeEditableForumTags(input: EditableForumTagInput[]) {
  const normalized = new Map<string, { slug: string; label: string; kind: "CORE" | "FREEFORM" }>();

  for (const candidate of input) {
    const requestedKind = candidate.kind?.trim().toLowerCase();
    const requestedSlug = normalizeSlug(candidate.slug?.trim() ?? "");
    const requestedLabel = candidate.label?.trim() ?? "";

    if (requestedKind === "core") {
      const coreTag = CORE_FORUM_TAGS.find((tag) => tag.slug === requestedSlug);
      if (!coreTag) {
        continue;
      }

      normalized.set(coreTag.slug, {
        slug: coreTag.slug,
        label: coreTag.label,
        kind: "CORE",
      });
      continue;
    }

    const freeform = normalizeForumFreeformTag(requestedLabel || requestedSlug);
    if (!freeform) {
      continue;
    }

    normalized.set(freeform.slug, {
      slug: freeform.slug,
      label: freeform.label,
      kind: "FREEFORM",
    });
  }

  return [...normalized.values()];
}

export async function persistForumPostTags(
  prismaClient: PersistForumTagClient,
  input: {
    postId: string;
    extracted: ExtractForumTagCandidatesResult;
    source?: "AUTO" | "MANUAL";
  }
) {
  const source = input.source ?? "AUTO";
  const tags = [...input.extracted.core, ...input.extracted.freeform];

  if (tags.length === 0) {
    return;
  }

  const tagIds = await Promise.all(
    tags.map(async (tag) => {
      const record = await prismaClient.forumTag.upsert({
        where: { slug: tag.slug },
        update: {
          label: tag.label,
          kind: input.extracted.core.some((core) => core.slug === tag.slug)
            ? "CORE"
            : "FREEFORM",
        },
        create: {
          slug: tag.slug,
          label: tag.label,
          kind: input.extracted.core.some((core) => core.slug === tag.slug)
            ? "CORE"
            : "FREEFORM",
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
    tags: Array<{ slug: string; label: string; kind: "CORE" | "FREEFORM" }>;
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
    extracted: {
      core: input.tags
        .filter((tag) => tag.kind === "CORE")
        .map(({ slug, label }) => ({ slug, label })),
      freeform: input.tags
        .filter((tag) => tag.kind === "FREEFORM")
        .map(({ slug, label }) => ({ slug, label })),
    },
    source: input.source ?? "MANUAL",
  });
}
