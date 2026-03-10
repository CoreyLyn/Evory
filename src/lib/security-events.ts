import { getRateLimitEventMetadata } from "@/lib/rate-limit";

export const VALID_SECURITY_EVENT_SEVERITIES = ["warning", "high"] as const;
export const VALID_SECURITY_EVENT_RANGES = ["24h", "7d", "30d"] as const;

export type SecurityEventApiSeverity =
  (typeof VALID_SECURITY_EVENT_SEVERITIES)[number];
export type SecurityEventApiRange = (typeof VALID_SECURITY_EVENT_RANGES)[number];

export type SecurityEventRecord = {
  id: string;
  type: string;
  routeKey: string;
  ipAddress: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | string | null;
};

export type NormalizedSecurityEventRecord = {
  id: string;
  type: string;
  routeKey: string;
  ipAddress: string;
  metadata: Record<string, unknown>;
  scope: string;
  severity: string;
  operation: string;
  summary: string;
  retryAfterSeconds: number | null;
  createdAt: string | null;
};

export function getSecurityEventRangeStart(range: SecurityEventApiRange) {
  const now = Date.now();

  switch (range) {
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
  }
}

export function buildSecurityEventsWhere(
  userId: string,
  filters: {
    severity?: SecurityEventApiSeverity;
    routeKey?: string;
    range?: SecurityEventApiRange;
  }
) {
  const where: Record<string, unknown> = {
    userId,
  };

  if (filters.routeKey) {
    where.routeKey = filters.routeKey;
  }

  if (filters.severity) {
    where.metadata = {
      path: ["severity"],
      equals: filters.severity,
    };
  }

  if (filters.range) {
    where.createdAt = {
      gte: getSecurityEventRangeStart(filters.range),
    };
  }

  return where;
}

export function normalizeSecurityEventRecord(
  event: SecurityEventRecord
): NormalizedSecurityEventRecord {
  const metadata = event.metadata ?? {};
  const fallback = getRateLimitEventMetadata(event.routeKey);

  return {
    id: event.id,
    type: event.type,
    routeKey: event.routeKey,
    ipAddress: event.ipAddress,
    metadata,
    scope: String(metadata.scope ?? fallback.scope),
    severity: String(metadata.severity ?? fallback.severity),
    operation: String(metadata.operation ?? fallback.operation),
    summary: String(metadata.summary ?? fallback.summary),
    retryAfterSeconds:
      typeof metadata.retryAfterSeconds === "number"
        ? metadata.retryAfterSeconds
        : null,
    createdAt:
      event.createdAt instanceof Date
        ? event.createdAt.toISOString()
        : event.createdAt ?? null,
  };
}

function escapeCsvCell(value: string | number | null) {
  if (value === null || value === "") {
    return "";
  }

  const stringValue = String(value);

  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
}

export function buildSecurityEventsCsv(
  events: NormalizedSecurityEventRecord[]
) {
  const header = [
    "createdAt",
    "type",
    "routeKey",
    "severity",
    "scope",
    "operation",
    "ipAddress",
    "retryAfterSeconds",
    "summary",
  ];

  const rows = events.map((event) =>
    [
      event.createdAt,
      event.type,
      event.routeKey,
      event.severity,
      event.scope,
      event.operation,
      event.ipAddress,
      event.retryAfterSeconds,
      event.summary,
    ]
      .map((value) => escapeCsvCell(value))
      .join(",")
  );

  return [header.join(","), ...rows].join("\n");
}
