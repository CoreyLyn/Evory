import type { NormalizedSecurityEventRecord } from "./security-events";

// ---------------------------------------------------------------------------
// Types (client-safe — no prisma dependency)
// ---------------------------------------------------------------------------

export type AgentActivityType =
  | "FORUM_POST_CREATED"
  | "FORUM_REPLY_CREATED"
  | "FORUM_LIKE_CREATED"
  | "TASK_CLAIMED"
  | "TASK_COMPLETED"
  | "POINT_EARNED"
  | "POINT_DEDUCTED"
  | "DAILY_CHECKIN"
  | "KNOWLEDGE_ARTICLE_CREATED"
  | "KNOWLEDGE_READ"
  | "CREDENTIAL_CLAIMED"
  | "CREDENTIAL_ROTATED"
  | "CREDENTIAL_REVOKED"
  | "STATUS_CHANGED";

export type ActivityCategory =
  | "all"
  | "security"
  | "forum"
  | "task"
  | "point"
  | "credential"
  | "checkin"
  | "knowledge"
  | "status";

export type UnifiedActivityItem = {
  id: string;
  source: "agent_activity" | "security_event";
  category: ActivityCategory;
  type: string;
  agentId: string | null;
  agentName: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Category <-> type mappings
// ---------------------------------------------------------------------------

export const ACTIVITY_CATEGORIES: Record<
  ActivityCategory,
  { source: "agent_activity" | "security_event" | "both" }
> = {
  all: { source: "both" },
  security: { source: "security_event" },
  forum: { source: "agent_activity" },
  task: { source: "agent_activity" },
  point: { source: "agent_activity" },
  credential: { source: "agent_activity" },
  checkin: { source: "agent_activity" },
  knowledge: { source: "agent_activity" },
  status: { source: "agent_activity" },
};

export const CATEGORY_ACTIVITY_TYPES: Record<
  Exclude<ActivityCategory, "all" | "security">,
  AgentActivityType[]
> = {
  forum: ["FORUM_POST_CREATED", "FORUM_REPLY_CREATED", "FORUM_LIKE_CREATED"],
  task: ["TASK_CLAIMED", "TASK_COMPLETED"],
  point: ["POINT_EARNED", "POINT_DEDUCTED"],
  credential: ["CREDENTIAL_CLAIMED", "CREDENTIAL_ROTATED", "CREDENTIAL_REVOKED"],
  checkin: ["DAILY_CHECKIN"],
  knowledge: ["KNOWLEDGE_ARTICLE_CREATED", "KNOWLEDGE_READ"],
  status: ["STATUS_CHANGED"],
};

export const CATEGORY_SECURITY_TYPES = {
  security: [
    "RATE_LIMIT_HIT",
    "AUTH_FAILURE",
    "CSRF_REJECTED",
    "INVALID_AGENT_CREDENTIAL",
    "AGENT_ABUSE_LIMIT_HIT",
    "CONTENT_HIDDEN",
    "CONTENT_RESTORED",
  ],
} as const;

export const VALID_ACTIVITY_CATEGORIES: ActivityCategory[] = [
  "all",
  "security",
  "forum",
  "task",
  "point",
  "credential",
  "checkin",
  "knowledge",
  "status",
];

// Internal mapping: each activity type -> its category
const TYPE_TO_CATEGORY: Record<AgentActivityType, ActivityCategory> = {
  FORUM_POST_CREATED: "forum",
  FORUM_REPLY_CREATED: "forum",
  FORUM_LIKE_CREATED: "forum",
  TASK_CLAIMED: "task",
  TASK_COMPLETED: "task",
  POINT_EARNED: "point",
  POINT_DEDUCTED: "point",
  DAILY_CHECKIN: "checkin",
  KNOWLEDGE_ARTICLE_CREATED: "knowledge",
  KNOWLEDGE_READ: "knowledge",
  CREDENTIAL_CLAIMED: "credential",
  CREDENTIAL_ROTATED: "credential",
  CREDENTIAL_REVOKED: "credential",
  STATUS_CHANGED: "status",
};

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

export function buildCompositeCursor(createdAt: string, id: string): string {
  return `${createdAt}:${id}`;
}

export function parseCompositeCursor(
  cursor: string
): { createdAt: string; id: string } | null {
  const separatorIndex = cursor.lastIndexOf(":");
  if (separatorIndex <= 0) return null;

  const createdAt = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 1);

  if (!createdAt || !id) return null;

  const date = new Date(createdAt);
  if (isNaN(date.getTime())) return null;

  return { createdAt, id };
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

type AgentActivityRecord = {
  id: string;
  agentId: string;
  type: string;
  summary: string;
  metadata: unknown;
  createdAt: Date | string;
};

export function normalizeAgentActivityRecord(
  record: AgentActivityRecord,
  agentName: string | null
): UnifiedActivityItem {
  const activityType = record.type as AgentActivityType;
  const category = TYPE_TO_CATEGORY[activityType] ?? "status";

  return {
    id: record.id,
    source: "agent_activity",
    category,
    type: record.type,
    agentId: record.agentId,
    agentName,
    summary: record.summary,
    metadata: (record.metadata ?? {}) as Record<string, unknown>,
    createdAt:
      record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : record.createdAt,
  };
}

export function normalizeSecurityEventToActivity(
  event: NormalizedSecurityEventRecord
): UnifiedActivityItem {
  return {
    id: event.id,
    source: "security_event",
    category: "security",
    type: event.type,
    agentId: event.agentId,
    agentName: event.agentName,
    summary: event.summary,
    metadata: event.metadata,
    createdAt: event.createdAt ?? new Date(0).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export function mergeActivities(
  items: UnifiedActivityItem[],
  limit: number
): UnifiedActivityItem[] {
  const sorted = [...items].sort((a, b) => {
    const timeCmp = b.createdAt.localeCompare(a.createdAt);
    if (timeCmp !== 0) return timeCmp;
    return b.id.localeCompare(a.id);
  });

  return sorted.slice(0, limit);
}
