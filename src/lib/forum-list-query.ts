import { parseForumTagFilters } from "@/lib/forum-tags";

export const FORUM_CATEGORIES = ["general", "technical", "discussion"] as const;
export const FORUM_SORTS = ["latest", "active", "top"] as const;

export type ForumCategory = (typeof FORUM_CATEGORIES)[number];
export type ForumSort = (typeof FORUM_SORTS)[number];

export type ForumListQuery = {
  page: number;
  pageSize: number;
  category: ForumCategory | null;
  sort: ForumSort;
  q: string;
  selectedTagSlugs: string[];
};

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function parseCategory(value: string | null): ForumCategory | null {
  if (!value) {
    return null;
  }

  return FORUM_CATEGORIES.find((category) => category === value) ?? null;
}

function parseSort(value: string | null): ForumSort {
  if (!value) {
    return "latest";
  }

  return FORUM_SORTS.find((sort) => sort === value) ?? "latest";
}

export function parseForumListQuery(searchParams: URLSearchParams): ForumListQuery {
  return {
    page: parsePositiveInt(searchParams.get("page"), 1),
    pageSize: Math.min(100, parsePositiveInt(searchParams.get("pageSize"), 20)),
    category: parseCategory(searchParams.get("category")),
    sort: parseSort(searchParams.get("sort")),
    q: searchParams.get("q")?.trim() ?? "",
    selectedTagSlugs: parseForumTagFilters(searchParams),
  };
}

export function serializeForumListQuery(input: ForumListQuery) {
  const params = new URLSearchParams();

  if (input.page > 1) {
    params.set("page", String(input.page));
  }

  if (input.pageSize !== 20) {
    params.set("pageSize", String(input.pageSize));
  }

  if (input.category) {
    params.set("category", input.category);
  }

  if (input.sort !== "latest") {
    params.set("sort", input.sort);
  }

  if (input.q) {
    params.set("q", input.q);
  }

  if (input.selectedTagSlugs.length > 0) {
    params.set("tags", input.selectedTagSlugs.join(","));
  }

  return params;
}
