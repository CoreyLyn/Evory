export const SECURITY_EVENT_SEVERITY_VALUES = [
  "all",
  "warning",
  "high",
] as const;

export const SECURITY_EVENT_ROUTE_VALUES = [
  "all",
  "agent-register",
  "agent-claim",
  "agent-rotate-key",
  "agent-revoke",
] as const;

export const SECURITY_EVENT_RANGE_VALUES = [
  "all",
  "24h",
  "7d",
  "30d",
] as const;

export type SecurityEventSeverityFilter =
  (typeof SECURITY_EVENT_SEVERITY_VALUES)[number];
export type SecurityEventRouteFilter =
  (typeof SECURITY_EVENT_ROUTE_VALUES)[number];
export type SecurityEventRangeFilter =
  (typeof SECURITY_EVENT_RANGE_VALUES)[number];

export type SecurityEventsFilters = {
  severity: SecurityEventSeverityFilter;
  routeKey: SecurityEventRouteFilter;
  range: SecurityEventRangeFilter;
  page: number;
};

const DEFAULT_SECURITY_EVENTS_FILTERS: SecurityEventsFilters = {
  severity: "all",
  routeKey: "all",
  range: "all",
  page: 1,
};

function isValidOption<T extends readonly string[]>(
  value: string | null | undefined,
  options: T
): value is T[number] {
  return Boolean(value && options.includes(value as T[number]));
}

export function parseSecurityEventsFilters(
  searchParams: URLSearchParams | ReadonlyURLSearchParamsLike
): SecurityEventsFilters {
  const severity = searchParams.get("severity");
  const routeKey = searchParams.get("routeKey");
  const range = searchParams.get("range");
  const pageParam = searchParams.get("page");
  const parsedPage = pageParam ? Number.parseInt(pageParam, 10) : NaN;

  return {
    severity: isValidOption(severity, SECURITY_EVENT_SEVERITY_VALUES)
      ? severity
      : DEFAULT_SECURITY_EVENTS_FILTERS.severity,
    routeKey: isValidOption(routeKey, SECURITY_EVENT_ROUTE_VALUES)
      ? routeKey
      : DEFAULT_SECURITY_EVENTS_FILTERS.routeKey,
    range: isValidOption(range, SECURITY_EVENT_RANGE_VALUES)
      ? range
      : DEFAULT_SECURITY_EVENTS_FILTERS.range,
    page:
      Number.isFinite(parsedPage) && parsedPage >= 1
        ? parsedPage
        : DEFAULT_SECURITY_EVENTS_FILTERS.page,
  };
}

export function normalizeSecurityEventsFilters(
  current: SecurityEventsFilters,
  updates: Partial<SecurityEventsFilters>
): SecurityEventsFilters {
  const next: SecurityEventsFilters = {
    ...current,
    ...updates,
  };

  if (
    updates.page === undefined &&
    (updates.severity !== undefined ||
      updates.routeKey !== undefined ||
      updates.range !== undefined)
  ) {
    next.page = 1;
  }

  if (!Number.isFinite(next.page) || next.page < 1) {
    next.page = 1;
  }

  return next;
}

export function buildSecurityEventsQueryString(
  filters: SecurityEventsFilters,
  options?: {
    includePage?: boolean;
  }
): string {
  const searchParams = new URLSearchParams();
  const includePage = options?.includePage ?? true;

  if (filters.severity !== DEFAULT_SECURITY_EVENTS_FILTERS.severity) {
    searchParams.set("severity", filters.severity);
  }

  if (filters.routeKey !== DEFAULT_SECURITY_EVENTS_FILTERS.routeKey) {
    searchParams.set("routeKey", filters.routeKey);
  }

  if (filters.range !== DEFAULT_SECURITY_EVENTS_FILTERS.range) {
    searchParams.set("range", filters.range);
  }

  if (includePage && filters.page !== DEFAULT_SECURITY_EVENTS_FILTERS.page) {
    searchParams.set("page", String(filters.page));
  }

  return searchParams.toString();
}

type ReadonlyURLSearchParamsLike = {
  get: (name: string) => string | null;
};
