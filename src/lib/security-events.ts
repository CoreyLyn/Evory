import { getRateLimitEventMetadata } from "@/lib/rate-limit";

export const VALID_SECURITY_EVENT_TYPES = [
  "RATE_LIMIT_HIT",
  "AUTH_FAILURE",
  "CSRF_REJECTED",
  "INVALID_AGENT_CREDENTIAL",
  "AGENT_ABUSE_LIMIT_HIT",
  "CONTENT_HIDDEN",
  "CONTENT_RESTORED",
] as const;
export const VALID_SECURITY_EVENT_SEVERITIES = ["warning", "high"] as const;
export const VALID_SECURITY_EVENT_RANGES = ["24h", "7d", "30d"] as const;

export type SecurityEventApiType = (typeof VALID_SECURITY_EVENT_TYPES)[number];
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
  agentId: string | null;
  agentName: string | null;
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

export function buildSecurityEventsWhere(config: {
  userId: string;
  userEmail?: string | null;
  ownedAgentIds?: string[];
  type?: SecurityEventApiType;
  severity?: SecurityEventApiSeverity;
  routeKey?: string;
  range?: SecurityEventApiRange;
}) {
  const visibilityClauses: Record<string, unknown>[] = [
    {
      userId: config.userId,
    },
  ];

  if (config.userEmail) {
    visibilityClauses.push({
      type: "AUTH_FAILURE",
      metadata: {
        path: ["email"],
        equals: config.userEmail,
      },
    });
  }

  for (const agentId of config.ownedAgentIds ?? []) {
    visibilityClauses.push({
      metadata: {
        path: ["agentId"],
        equals: agentId,
      },
    });
  }

  const andClauses: Record<string, unknown>[] = [
    {
      OR: visibilityClauses,
    },
  ];

  if (config.type) {
    andClauses.push({
      type: config.type,
    });
  }

  if (config.routeKey) {
    andClauses.push({
      routeKey: config.routeKey,
    });
  }

  if (config.severity) {
    andClauses.push({
      metadata: {
        path: ["severity"],
        equals: config.severity,
      },
    });
  }

  if (config.range) {
    andClauses.push({
      createdAt: {
        gte: getSecurityEventRangeStart(config.range),
      },
    });
  }

  return {
    AND: andClauses,
  };
}

function getSecurityEventFallbackMetadata(event: SecurityEventRecord) {
  if (event.type === "RATE_LIMIT_HIT" || event.type === "AGENT_ABUSE_LIMIT_HIT") {
    return getRateLimitEventMetadata(event.routeKey);
  }

  switch (event.type) {
    case "AUTH_FAILURE":
      return {
        scope: "user",
        severity: "warning",
        operation: "auth_failure",
        summary: "Authentication attempt failed.",
      };
    case "CSRF_REJECTED":
      return {
        scope: "user",
        severity: "high",
        operation: "same_origin_guard",
        summary:
          "Control-plane mutation request was rejected by same-origin protection.",
      };
    case "INVALID_AGENT_CREDENTIAL":
      return {
        scope: "credential",
        severity: "warning",
        operation: "agent_auth",
        summary: "Agent credential was rejected during authentication.",
      };
    default:
      return {
        scope: "unknown",
        severity: "warning",
        operation: event.type.toLowerCase(),
        summary: "Security event recorded.",
      };
  }
}

export function normalizeSecurityEventRecord(
  event: SecurityEventRecord
): NormalizedSecurityEventRecord {
  const metadata = event.metadata ?? {};
  const fallback = getSecurityEventFallbackMetadata(event);

  return {
    id: event.id,
    type: event.type,
    routeKey: event.routeKey,
    agentId: typeof metadata.agentId === "string" ? metadata.agentId : null,
    agentName: typeof metadata.agentName === "string" ? metadata.agentName : null,
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

export function collectSecurityEventAgentIds(
  events: NormalizedSecurityEventRecord[]
) {
  return Array.from(
    new Set(
      events
        .map((event) => event.agentId)
        .filter((agentId): agentId is string => Boolean(agentId))
    )
  );
}

export function attachSecurityEventAgentNames(
  events: NormalizedSecurityEventRecord[],
  agentNames: Record<string, string>
) {
  return events.map((event) => ({
    ...event,
    agentName: event.agentId ? agentNames[event.agentId] ?? event.agentName : null,
  }));
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
    "agentId",
    "agentName",
    "ipAddress",
    "retryAfterSeconds",
    "reason",
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
      event.agentId,
      event.agentName,
      event.ipAddress,
      event.retryAfterSeconds,
      typeof event.metadata.reason === "string" ? event.metadata.reason : null,
      event.summary,
    ]
      .map((value) => escapeCsvCell(value))
      .join(",")
  );

  return [header.join(","), ...rows].join("\n");
}
