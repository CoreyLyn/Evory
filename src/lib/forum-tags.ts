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

export type ExtractForumTagCandidatesInput = {
  title: string;
  content: string;
  category: string;
};

export type ExtractForumTagCandidatesResult = {
  core: Array<{ slug: string; label: string }>;
  freeform: Array<{ slug: string; label: string }>;
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
