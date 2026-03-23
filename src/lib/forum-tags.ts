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
const MAX_FREEFORM_LABEL_LENGTH = 24;
const MAX_FREEFORM_WORD_COUNT = 4;
const MAX_FREEFORM_HAN_CHAR_COUNT = 12;
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

type CoreForumTagSlug = (typeof CORE_FORUM_TAGS)[number]["slug"];
type CoreTagAliasBucket = {
  latinTokens: string[];
  latinPhrases: string[];
  cjkPhrases: string[];
};

const CORE_TAG_ALIASES: Record<CoreForumTagSlug, CoreTagAliasBucket> = {
  frontend: {
    latinTokens: ["frontend", "ui", "client", "browser", "css", "react"],
    latinPhrases: [],
    cjkPhrases: ["前端", "界面", "浏览器"],
  },
  backend: {
    latinTokens: ["backend", "server", "service"],
    latinPhrases: [],
    cjkPhrases: ["后端", "服务端"],
  },
  database: {
    latinTokens: ["database", "db", "postgres", "prisma", "sql"],
    latinPhrases: [],
    cjkPhrases: ["数据库", "数据表"],
  },
  api: {
    latinTokens: ["api", "endpoint", "route", "http"],
    latinPhrases: ["http api"],
    cjkPhrases: ["接口", "路由", "接口网关"],
  },
  bugfix: {
    latinTokens: ["bug", "bugfix", "fix", "error", "issue", "broken", "timeout"],
    latinPhrases: [],
    cjkPhrases: ["修复", "报错", "错误", "异常", "故障", "超时"],
  },
  performance: {
    latinTokens: ["performance", "optimize", "optimization", "slow", "latency"],
    latinPhrases: [],
    cjkPhrases: ["性能", "优化", "慢", "延迟"],
  },
  deployment: {
    latinTokens: ["deploy", "deployment", "release", "ship", "rollout"],
    latinPhrases: ["ci/cd", "ci cd"],
    cjkPhrases: ["部署", "发布", "上线"],
  },
  testing: {
    latinTokens: ["test", "testing", "coverage", "spec", "assert"],
    latinPhrases: [],
    cjkPhrases: ["测试", "覆盖率"],
  },
  security: {
    latinTokens: ["security", "csrf", "auth", "credential", "permission", "scope"],
    latinPhrases: [],
    cjkPhrases: ["安全", "认证", "权限"],
  },
  ux: {
    latinTokens: ["ux", "copy", "layout", "accessibility"],
    latinPhrases: ["user experience"],
    cjkPhrases: ["体验", "可访问性", "界面文案"],
  },
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

type ForumTagFilterSummary = {
  slug: string;
  label: string;
  kind: string;
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
  suggestedTags?: string[];
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
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSearchableText(input: string) {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenizeLatinText(input: string) {
  return (input.match(/[\p{Script=Latin}\p{Number}]+/gu) ?? [])
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function hasLatinTokenMatch(tokens: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => tokens.has(candidate));
}

function hasLatinPhraseMatch(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function hasCjkPhraseMatch(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function matchesCoreForumTag(
  text: string,
  slug: CoreForumTagSlug
) {
  const aliases = CORE_TAG_ALIASES[slug];
  const normalizedText = normalizeSearchableText(text);
  const latinTokens = new Set(tokenizeLatinText(normalizedText));

  return (
    normalizeSlug(normalizedText) === slug ||
    hasLatinTokenMatch(latinTokens, aliases.latinTokens) ||
    hasLatinPhraseMatch(normalizedText, aliases.latinPhrases) ||
    hasCjkPhraseMatch(normalizedText, aliases.cjkPhrases)
  );
}

function findMatchingCoreForumTags(text: string) {
  return CORE_FORUM_TAGS.filter(({ slug }) => matchesCoreForumTag(text, slug));
}

function toSearchableText(input: ExtractForumTagCandidatesInput) {
  return `${input.title} ${input.content} ${input.category}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isSentenceLikeFreeformLabel(label: string) {
  const words = label.split(/\s+/).filter(Boolean);
  const hanChars = (label.match(/\p{Script=Han}/gu) ?? []).length;

  return (
    label.length > MAX_FREEFORM_LABEL_LENGTH ||
    words.length > MAX_FREEFORM_WORD_COUNT ||
    hanChars > MAX_FREEFORM_HAN_CHAR_COUNT
  );
}

function normalizeSuggestedForumTags(suggestedTags: string[]) {
  const core = new Map<string, { slug: string; label: string }>();
  const freeform = new Map<string, { slug: string; label: string }>();

  for (const rawTag of suggestedTags) {
    const matchedCore = findMatchingCoreForumTags(rawTag);
    if (matchedCore.length > 0) {
      for (const coreTag of matchedCore) {
        core.set(coreTag.slug, coreTag);
      }
      continue;
    }

    const normalizedFreeform = normalizeForumFreeformTag(rawTag);
    if (!normalizedFreeform) {
      continue;
    }

    freeform.set(normalizedFreeform.slug, normalizedFreeform);
  }

  return {
    core: [...core.values()],
    freeform: [...freeform.values()],
  };
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
  if (isSentenceLikeFreeformLabel(label)) return null;

  const slug = normalizeSlug(label);

  if (
    !slug ||
    FORUM_CATEGORY_SLUGS.has(slug) ||
    FREEFORM_STOP_WORDS.has(slug)
  ) {
    return null;
  }

  return {
    slug: slug.slice(0, 40).replace(/-+$/g, ""),
    label,
  };
}

export function extractForumTagCandidates(
  input: ExtractForumTagCandidatesInput
): ExtractForumTagCandidatesResult {
  const text = toSearchableText(input);
  const normalizedSuggested = normalizeSuggestedForumTags(input.suggestedTags ?? []);
  const matchedCore = [...new Map(
    [...findMatchingCoreForumTags(text), ...normalizedSuggested.core].map((tag) => [
      tag.slug,
      tag,
    ])
  ).values()];
  const maxFreeformCount =
    matchedCore.length === 0 ? 2 : matchedCore.length === 1 ? 1 : 0;

  const freeformPhrases = [
    ...normalizedSuggested.freeform,
    ...[
      ...input.title.split(/[-:,/|，。！？；：、()[\]\n]/),
      ...input.content.split(/[.!?,;:\n|，。！？；：、()[\]]/),
    ].map((part) => normalizeForumFreeformTag(part))
    .filter((value): value is NonNullable<typeof value> => value !== null)
  ]
    .filter((value) => !matchedCore.some((core) => core.slug === value.slug));

  return {
    core: matchedCore,
    freeform: [...new Map(
      freeformPhrases.slice(0, maxFreeformCount).map((tag) => [tag.slug, tag])
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

export function buildForumTagFilterPayloads(input: {
  tagSummaries: ForumTagFilterSummary[];
  selectedTagSlugs: string[];
}) {
  const filters = input.tagSummaries.map((tag) => ({
    slug: tag.slug,
    label: tag.label,
    kind: tag.kind.toLowerCase() as ForumTagKind,
    postCount: tag.postCount,
  }));

  for (const slug of input.selectedTagSlugs) {
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

  return [...filters].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "core" ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });
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
