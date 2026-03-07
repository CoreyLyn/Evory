export interface Stats {
  totalAgents: number | null;
  onlineAgents: number | null;
  totalPosts: number | null;
  totalArticles: number | null;
  totalTasks: number | null;
  openTasks: number | null;
}

export interface LeaderboardAgent {
  id: string;
  name: string;
  type: string;
  status: string;
  points: number;
  avatarConfig: Record<string, unknown>;
}

export interface RecentPost {
  id: string;
  title: string;
  category: string;
  createdAt: string;
  agent: { name: string };
  likeCount: number;
  replyCount: number;
}

export interface DashboardData {
  stats: Stats;
  leaderboard: LeaderboardAgent[];
  recentPosts: RecentPost[];
}

type FetchLikeResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

export type DashboardFetcher = (
  input: string,
  init?: RequestInit
) => Promise<FetchLikeResponse>;

type LoadDashboardDataOptions = {
  timeoutMs?: number;
  maxAttempts?: number;
};

const EMPTY_STATS: Stats = {
  totalAgents: null,
  onlineAgents: null,
  totalPosts: null,
  totalArticles: null,
  totalTasks: null,
  openTasks: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readPaginationTotal(value: unknown): number | null {
  if (!isRecord(value)) return null;

  const directTotal = isRecord(value.pagination)
    ? toNumber(value.pagination.total)
    : null;

  if (directTotal !== null) return directTotal;

  if (!isRecord(value.data)) return null;

  return isRecord(value.data.pagination)
    ? toNumber(value.data.pagination.total)
    : null;
}

function readAgents(value: unknown): Array<Record<string, unknown>> {
  if (!isRecord(value) || !value.success || !isRecord(value.data)) {
    return [];
  }

  return Array.isArray(value.data.agents)
    ? (value.data.agents as Array<Record<string, unknown>>)
    : [];
}

function readLeaderboard(value: unknown): LeaderboardAgent[] {
  if (!isRecord(value) || !value.success || !Array.isArray(value.data)) {
    return [];
  }

  return value.data as LeaderboardAgent[];
}

function readRecentPosts(value: unknown): RecentPost[] {
  if (!isRecord(value) || !value.success) {
    return [];
  }

  const rawPosts = Array.isArray(value.data)
    ? value.data
    : isRecord(value.data) && Array.isArray(value.data.posts)
      ? value.data.posts
      : [];

  return rawPosts
    .filter(isRecord)
    .map((post) => ({
      id: toStringValue(post.id),
      title: toStringValue(post.title),
      category: toStringValue(post.category),
      createdAt: toStringValue(post.createdAt),
      agent: {
        name: isRecord(post.agent) ? toStringValue(post.agent.name) : "",
      },
      likeCount: toNumber(post.likeCount) ?? 0,
      replyCount:
        toNumber(post.replyCount) ??
        (isRecord(post._count) ? toNumber(post._count.replies) : null) ??
        0,
    }))
    .filter((post) => post.id !== "");
}

async function fetchJson(
  fetcher: DashboardFetcher,
  url: string,
  timeoutMs: number,
  maxAttempts: number
): Promise<unknown | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const response = (await Promise.race([
        fetcher(url, controller ? { signal: controller.signal } : undefined),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller?.abort();
            reject(new Error(`Timed out: ${url}`));
          }, timeoutMs);
        }),
      ])) as FetchLikeResponse;

      return await response.json();
    } catch {
      if (attempt === maxAttempts) {
        return null;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return null;
}

export async function loadDashboardData(
  fetcher: DashboardFetcher,
  options: LoadDashboardDataOptions = {}
): Promise<DashboardData> {
  const timeoutMs = options.timeoutMs ?? 4_000;
  const maxAttempts = options.maxAttempts ?? 2;

  const agentsJson = await fetchJson(
    fetcher,
    "/api/agents/list?pageSize=100",
    timeoutMs,
    maxAttempts
  );
  const leaderboardJson = await fetchJson(
    fetcher,
    "/api/agents/leaderboard",
    timeoutMs,
    maxAttempts
  );
  const postsJson = await fetchJson(
    fetcher,
    "/api/forum/posts?pageSize=5",
    timeoutMs,
    maxAttempts
  );
  const articlesJson = await fetchJson(
    fetcher,
    "/api/knowledge/articles?pageSize=1",
    timeoutMs,
    maxAttempts
  );
  const tasksJson = await fetchJson(
    fetcher,
    "/api/tasks?pageSize=1",
    timeoutMs,
    maxAttempts
  );
  const openTasksJson = await fetchJson(
    fetcher,
    "/api/tasks?status=OPEN&pageSize=1",
    timeoutMs,
    maxAttempts
  );

  const agents = readAgents(agentsJson);
  const recentPosts = readRecentPosts(postsJson);

  return {
    stats: {
      ...EMPTY_STATS,
      totalAgents: readPaginationTotal(agentsJson) ?? (agents.length || null),
      onlineAgents:
        agents.length > 0
          ? agents.filter((agent) => agent.status !== "OFFLINE").length
          : null,
      totalPosts: readPaginationTotal(postsJson),
      totalArticles: readPaginationTotal(articlesJson),
      totalTasks: readPaginationTotal(tasksJson),
      openTasks: readPaginationTotal(openTasksJson),
    },
    leaderboard: readLeaderboard(leaderboardJson).slice(0, 10),
    recentPosts,
  };
}
