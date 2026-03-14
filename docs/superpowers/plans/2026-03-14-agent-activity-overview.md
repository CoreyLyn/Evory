# Agent Activity Overview Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the "Recent Security Events" section into a unified "Agent Activity Overview" that displays both security events and normal agent activities in a single timeline.

**Architecture:** New `AgentActivity` table records all non-security agent activities. A new unified API endpoint merges `AgentActivity` and `SecurityEvent` tables using composite cursor pagination. The frontend replaces the old security events UI with a category-filterable activity timeline.

**Tech Stack:** Next.js 16 (App Router) · Prisma 7 · PostgreSQL · React 19 · Tailwind CSS 4 · Node.js native test runner

**Spec:** `docs/superpowers/specs/2026-03-14-agent-activity-overview-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|----------------|
| `src/lib/agent-activity.ts` | `recordAgentActivity()`, category/type constants, cursor helpers, two-table merge logic |
| `src/lib/agent-activity.test.ts` | Unit tests for agent-activity library |
| `src/app/api/users/me/agent-activities/route.ts` | Unified activity API endpoint with rate limiting |
| `src/app/api/users/me/agent-activities/route.test.ts` | API route handler tests |

### Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `AgentActivityType` enum, `AgentActivity` model, `Agent.activities` relation |
| `src/lib/points.ts` | Add `recordAgentActivity()` calls inside `awardPoints()`/`deductPoints()` transactions |
| `src/app/api/forum/posts/route.ts` | Record `FORUM_POST_CREATED` after post creation |
| `src/app/api/forum/posts/[id]/replies/route.ts` | Record `FORUM_REPLY_CREATED` after reply creation |
| `src/app/api/forum/posts/[id]/like/route.ts` | Record `FORUM_LIKE_CREATED` after like |
| `src/app/api/tasks/[id]/claim/route.ts` | Record `TASK_CLAIMED` after task claim |
| `src/app/api/tasks/[id]/complete/route.ts` | Record `TASK_COMPLETED` after task completion |
| `src/app/api/agents/me/status/route.ts` | Record `STATUS_CHANGED` after status update |
| `src/app/api/agents/claim/route.ts` | Extend `ClaimRoutePrismaClient` type + record `CREDENTIAL_CLAIMED` inside claim transaction |
| `src/app/api/users/me/agents/[id]/rotate-key/route.ts` | Extend `RotateOwnedAgentPrismaClient` type + record `CREDENTIAL_ROTATED` inside rotate transaction |
| `src/app/api/users/me/agents/[id]/revoke/route.ts` | Extend `RevokeOwnedAgentPrismaClient` type + record `CREDENTIAL_REVOKED` inside revoke transaction |
| `src/app/settings/agents/page.tsx` | Replace security events section with activity overview UI |
| `src/i18n/zh.ts` | Add activity overview translation keys |
| `src/i18n/en.ts` | Add activity overview translation keys |

---

## Chunk 1: Database Schema & Core Library

### Task 1: Add AgentActivity model to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma:46` (after SecurityEventType enum)
- Modify: `prisma/schema.prisma:125` (Agent model, add activities relation)

- [ ] **Step 1: Add AgentActivityType enum and AgentActivity model**

Add after line 46 (after `SecurityEventType` enum closing brace) in `prisma/schema.prisma`:

```prisma
enum AgentActivityType {
  FORUM_POST_CREATED
  FORUM_REPLY_CREATED
  FORUM_LIKE_CREATED
  TASK_CLAIMED
  TASK_COMPLETED
  POINT_EARNED
  POINT_DEDUCTED
  DAILY_CHECKIN
  KNOWLEDGE_ARTICLE_CREATED
  CREDENTIAL_CLAIMED
  CREDENTIAL_ROTATED
  CREDENTIAL_REVOKED
  STATUS_CHANGED
}

model AgentActivity {
  id        String            @id @default(cuid())
  agentId   String
  type      AgentActivityType
  summary   String
  metadata  Json              @default("{}")
  createdAt DateTime          @default(now())

  agent Agent @relation(fields: [agentId], references: [id], onDelete: Cascade)

  @@index([agentId])
  @@index([type])
  @@index([createdAt])
  @@index([agentId, createdAt])
}
```

- [ ] **Step 2: Add activities relation to Agent model**

Add to Agent model at line 125 (after `claimAudits` line):

```prisma
  activities      AgentActivity[]
```

- [ ] **Step 3: Generate Prisma client and create migration**

Run:
```bash
npm run prisma:generate
npm run db:migrate -- --name add_agent_activity
```
Expected: Migration created and applied successfully.

- [ ] **Step 4: Verify schema is valid**

Run: `npx prisma validate`
Expected: "Prisma schema is valid."

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add AgentActivity model for unified activity tracking"
```

### Task 2: Create agent-activity core library

**Files:**
- Create: `src/lib/agent-activity.ts`

- [ ] **Step 1: Create the agent-activity library with types and constants**

Create `src/lib/agent-activity.ts`:

```typescript
import prisma from "./prisma";
import type { AgentActivityType } from "@/generated/prisma/client";

// Re-export for convenience
export type { AgentActivityType } from "@/generated/prisma/client";

type PrismaTransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

// --- Category mapping ---

export const ACTIVITY_CATEGORIES = [
  "all",
  "security",
  "forum",
  "task",
  "point",
  "credential",
  "checkin",
  "knowledge",
  "status",
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

const CATEGORY_TO_ACTIVITY_TYPES: Record<
  Exclude<ActivityCategory, "all" | "security">,
  AgentActivityType[]
> = {
  forum: ["FORUM_POST_CREATED", "FORUM_REPLY_CREATED", "FORUM_LIKE_CREATED"],
  task: ["TASK_CLAIMED", "TASK_COMPLETED"],
  point: ["POINT_EARNED", "POINT_DEDUCTED"],
  credential: ["CREDENTIAL_CLAIMED", "CREDENTIAL_ROTATED", "CREDENTIAL_REVOKED"],
  checkin: ["DAILY_CHECKIN"],
  knowledge: ["KNOWLEDGE_ARTICLE_CREATED"],
  status: ["STATUS_CHANGED"],
};

const SECURITY_EVENT_TYPES = [
  "RATE_LIMIT_HIT",
  "AUTH_FAILURE",
  "CSRF_REJECTED",
  "INVALID_AGENT_CREDENTIAL",
  "AGENT_ABUSE_LIMIT_HIT",
  "CONTENT_HIDDEN",
  "CONTENT_RESTORED",
] as const;

export function getActivityTypesForCategory(
  category: ActivityCategory
): AgentActivityType[] | null {
  if (category === "all" || category === "security") return null;
  return CATEGORY_TO_ACTIVITY_TYPES[category] ?? null;
}

export function categoryIncludesSecurityEvents(
  category: ActivityCategory
): boolean {
  return category === "all" || category === "security";
}

export function categoryIncludesAgentActivities(
  category: ActivityCategory
): boolean {
  return category !== "security";
}

export function isValidActivityCategory(value: string): value is ActivityCategory {
  return (ACTIVITY_CATEGORIES as readonly string[]).includes(value);
}

export function isActivityTypeInCategory(
  type: string,
  category: ActivityCategory
): boolean {
  if (category === "all") return true;
  if (category === "security") {
    return (SECURITY_EVENT_TYPES as readonly string[]).includes(type);
  }
  const types = CATEGORY_TO_ACTIVITY_TYPES[category];
  return types ? (types as string[]).includes(type) : false;
}

// --- Unified activity item ---

export type UnifiedActivityItem = {
  id: string;
  source: "agent_activity" | "security_event";
  category: string;
  type: string;
  agentId: string | null;
  agentName: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// --- Cursor helpers ---

export function encodeCursor(createdAt: Date | string, id: string): string {
  const iso =
    createdAt instanceof Date ? createdAt.toISOString() : createdAt;
  return `${iso}:${id}`;
}

export function decodeCursor(
  cursor: string
): { createdAt: Date; id: string } | null {
  const separatorIndex = cursor.lastIndexOf(":");
  if (separatorIndex === -1) return null;

  const datePart = cursor.slice(0, separatorIndex);
  const idPart = cursor.slice(separatorIndex + 1);
  const date = new Date(datePart);

  if (isNaN(date.getTime()) || !idPart) return null;
  return { createdAt: date, id: idPart };
}

export function buildCursorWhereClause(cursor: { createdAt: Date; id: string }) {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      {
        createdAt: cursor.createdAt,
        id: { lt: cursor.id },
      },
    ],
  };
}

// --- Time range ---

export const VALID_ACTIVITY_RANGES = ["24h", "7d", "30d"] as const;
export type ActivityRange = (typeof VALID_ACTIVITY_RANGES)[number];

export function getRangeStart(range: ActivityRange): Date {
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

// --- Merge logic ---

export function mergeAndSlice(
  activities: UnifiedActivityItem[],
  securityEvents: UnifiedActivityItem[],
  limit: number
): { items: UnifiedActivityItem[]; hasMore: boolean } {
  const merged = [...activities, ...securityEvents].sort((a, b) => {
    const timeCompare =
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (timeCompare !== 0) return timeCompare;
    return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
  });

  const hasMore = merged.length > limit;
  return {
    items: merged.slice(0, limit),
    hasMore,
  };
}

// --- Category resolver for AgentActivityType ---

export function getCategoryForActivityType(type: AgentActivityType): string {
  for (const [category, types] of Object.entries(CATEGORY_TO_ACTIVITY_TYPES)) {
    if ((types as string[]).includes(type)) return category;
  }
  return "unknown";
}

// --- Record activity ---

export async function recordAgentActivity(
  params: {
    agentId: string;
    type: AgentActivityType;
    summary: string;
    metadata?: Record<string, unknown>;
  },
  tx?: PrismaTransactionClient
): Promise<void> {
  const client = tx ?? prisma;
  await client.agentActivity.create({
    data: {
      agentId: params.agentId,
      type: params.type,
      summary: params.summary,
      metadata: params.metadata ?? {},
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agent-activity.ts
git commit -m "feat: add agent-activity core library with types, cursor helpers, and merge logic"
```

### Task 3: Write unit tests for agent-activity library

**Files:**
- Create: `src/lib/agent-activity.test.ts`

- [ ] **Step 1: Write tests**

Create `src/lib/agent-activity.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeCursor,
  decodeCursor,
  buildCursorWhereClause,
  mergeAndSlice,
  isValidActivityCategory,
  categoryIncludesSecurityEvents,
  categoryIncludesAgentActivities,
  getActivityTypesForCategory,
  isActivityTypeInCategory,
  getCategoryForActivityType,
  getRangeStart,
  type UnifiedActivityItem,
  type AgentActivityType,
} from "./agent-activity";

// --- Cursor helpers ---

test("encodeCursor encodes Date and id", () => {
  const date = new Date("2026-03-14T10:00:00.000Z");
  const result = encodeCursor(date, "clxyz123");
  assert.equal(result, "2026-03-14T10:00:00.000Z:clxyz123");
});

test("encodeCursor encodes ISO string and id", () => {
  const result = encodeCursor("2026-03-14T10:00:00.000Z", "abc");
  assert.equal(result, "2026-03-14T10:00:00.000Z:abc");
});

test("decodeCursor round-trips with encodeCursor", () => {
  const date = new Date("2026-03-14T10:00:00.000Z");
  const encoded = encodeCursor(date, "clxyz123");
  const decoded = decodeCursor(encoded);
  assert.ok(decoded);
  assert.equal(decoded.createdAt.toISOString(), date.toISOString());
  assert.equal(decoded.id, "clxyz123");
});

test("decodeCursor returns null for invalid cursor", () => {
  assert.equal(decodeCursor("invalid"), null);
  assert.equal(decodeCursor(""), null);
});

test("decodeCursor handles id containing colons", () => {
  const encoded = "2026-03-14T10:00:00.000Z:id:with:colons";
  const decoded = decodeCursor(encoded);
  assert.ok(decoded);
  assert.equal(decoded.id, "colons");
});

test("buildCursorWhereClause returns correct OR structure", () => {
  const cursor = { createdAt: new Date("2026-03-14T10:00:00.000Z"), id: "abc" };
  const clause = buildCursorWhereClause(cursor);
  assert.ok(clause.OR);
  assert.equal(clause.OR.length, 2);
});

// --- Category helpers ---

test("isValidActivityCategory accepts valid categories", () => {
  assert.equal(isValidActivityCategory("all"), true);
  assert.equal(isValidActivityCategory("security"), true);
  assert.equal(isValidActivityCategory("forum"), true);
  assert.equal(isValidActivityCategory("task"), true);
  assert.equal(isValidActivityCategory("invalid"), false);
});

test("categoryIncludesSecurityEvents", () => {
  assert.equal(categoryIncludesSecurityEvents("all"), true);
  assert.equal(categoryIncludesSecurityEvents("security"), true);
  assert.equal(categoryIncludesSecurityEvents("forum"), false);
});

test("categoryIncludesAgentActivities", () => {
  assert.equal(categoryIncludesAgentActivities("all"), true);
  assert.equal(categoryIncludesAgentActivities("security"), false);
  assert.equal(categoryIncludesAgentActivities("forum"), true);
});

test("getActivityTypesForCategory returns types for forum", () => {
  const types = getActivityTypesForCategory("forum");
  assert.deepEqual(types, [
    "FORUM_POST_CREATED",
    "FORUM_REPLY_CREATED",
    "FORUM_LIKE_CREATED",
  ]);
});

test("getActivityTypesForCategory returns null for all and security", () => {
  assert.equal(getActivityTypesForCategory("all"), null);
  assert.equal(getActivityTypesForCategory("security"), null);
});

test("isActivityTypeInCategory matches correctly", () => {
  assert.equal(isActivityTypeInCategory("FORUM_POST_CREATED", "forum"), true);
  assert.equal(isActivityTypeInCategory("FORUM_POST_CREATED", "task"), false);
  assert.equal(isActivityTypeInCategory("RATE_LIMIT_HIT", "security"), true);
  assert.equal(isActivityTypeInCategory("RATE_LIMIT_HIT", "forum"), false);
  assert.equal(isActivityTypeInCategory("FORUM_POST_CREATED", "all"), true);
});

test("getCategoryForActivityType resolves correctly", () => {
  assert.equal(
    getCategoryForActivityType("FORUM_POST_CREATED" as AgentActivityType),
    "forum"
  );
  assert.equal(
    getCategoryForActivityType("TASK_CLAIMED" as AgentActivityType),
    "task"
  );
  assert.equal(
    getCategoryForActivityType("POINT_EARNED" as AgentActivityType),
    "point"
  );
});

// --- Merge logic ---

function makeItem(
  id: string,
  createdAt: string,
  source: "agent_activity" | "security_event"
): UnifiedActivityItem {
  return {
    id,
    source,
    category: source === "security_event" ? "security" : "forum",
    type: "TEST",
    agentId: null,
    agentName: null,
    summary: "test",
    metadata: {},
    createdAt,
  };
}

test("mergeAndSlice sorts by createdAt desc then id desc", () => {
  const activities = [
    makeItem("b", "2026-03-14T10:00:00.000Z", "agent_activity"),
    makeItem("a", "2026-03-14T09:00:00.000Z", "agent_activity"),
  ];
  const security = [
    makeItem("c", "2026-03-14T10:00:00.000Z", "security_event"),
  ];

  const { items } = mergeAndSlice(activities, security, 10);
  assert.equal(items[0].id, "c"); // same time, "c" > "b"
  assert.equal(items[1].id, "b");
  assert.equal(items[2].id, "a");
});

test("mergeAndSlice respects limit and hasMore", () => {
  const activities = [
    makeItem("a", "2026-03-14T10:00:00.000Z", "agent_activity"),
    makeItem("b", "2026-03-14T09:00:00.000Z", "agent_activity"),
  ];
  const security = [
    makeItem("c", "2026-03-14T08:00:00.000Z", "security_event"),
  ];

  const { items, hasMore } = mergeAndSlice(activities, security, 2);
  assert.equal(items.length, 2);
  assert.equal(hasMore, true);
});

test("mergeAndSlice hasMore false when total <= limit", () => {
  const activities = [makeItem("a", "2026-03-14T10:00:00.000Z", "agent_activity")];
  const { items, hasMore } = mergeAndSlice(activities, [], 5);
  assert.equal(items.length, 1);
  assert.equal(hasMore, false);
});

// --- Range ---

test("getRangeStart returns correct offset", () => {
  const now = Date.now();
  const start24h = getRangeStart("24h");
  const diff24h = now - start24h.getTime();
  assert.ok(diff24h >= 24 * 60 * 60 * 1000 - 100);
  assert.ok(diff24h <= 24 * 60 * 60 * 1000 + 100);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/agent-activity.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent-activity.test.ts
git commit -m "test: add unit tests for agent-activity library"
```

---

## Chunk 2: Unified API Endpoint

### Task 4: Create the unified agent-activities API route

**Files:**
- Create: `src/app/api/users/me/agent-activities/route.ts`

- [ ] **Step 1: Create the route handler**

Create `src/app/api/users/me/agent-activities/route.ts`:

```typescript
import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { authenticateUser } from "@/lib/user-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  buildSecurityEventsWhere,
  normalizeSecurityEventRecord,
  collectSecurityEventAgentIds,
  attachSecurityEventAgentNames,
} from "@/lib/security-events";
import {
  isValidActivityCategory,
  categoryIncludesSecurityEvents,
  categoryIncludesAgentActivities,
  getActivityTypesForCategory,
  isActivityTypeInCategory,
  decodeCursor,
  buildCursorWhereClause,
  encodeCursor,
  mergeAndSlice,
  getCategoryForActivityType,
  getRangeStart,
  VALID_ACTIVITY_RANGES,
  type ActivityCategory,
  type ActivityRange,
  type UnifiedActivityItem,
} from "@/lib/agent-activity";

type AgentActivitiesPrismaClient = {
  agent: {
    findMany: (args: unknown) => Promise<Array<{ id: string; name: string }>>;
  };
  agentActivity: {
    findMany: (args: unknown) => Promise<
      Array<{
        id: string;
        agentId: string;
        type: string;
        summary: string;
        metadata: Record<string, unknown> | null;
        createdAt: Date;
      }>
    >;
  };
  securityEvent?: {
    findMany: (args: unknown) => Promise<
      Array<{
        id: string;
        type: string;
        routeKey: string;
        ipAddress: string;
        metadata?: Record<string, unknown> | null;
        createdAt?: Date | string | null;
      }>
    >;
  };
};

const activityPrisma = prisma as unknown as AgentActivitiesPrismaClient;

export async function GET(request: NextRequest) {
  const user = await authenticateUser(request);
  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const rateLimited = await enforceRateLimit({
    bucketId: "user-agent-activities",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: user.id,
    routeKey: "user-agent-activities",
    userId: user.id,
  });
  if (rateLimited) return rateLimited;

  try {
    const params = request.nextUrl.searchParams;
    const categoryParam = params.get("category")?.trim() || "all";
    const typeParam = params.get("type")?.trim() || "";
    const agentIdParam = params.get("agentId")?.trim() || "";
    const rangeParam = params.get("range")?.trim() || "";
    const cursorParam = params.get("cursor")?.trim() || "";
    const limitParam = params.get("limit")?.trim() || "";

    // Validate category
    if (!isValidActivityCategory(categoryParam)) {
      return Response.json(
        { success: false, error: "Invalid category" },
        { status: 400 }
      );
    }
    const category: ActivityCategory = categoryParam;

    // Validate limit
    let limit = 20;
    if (limitParam) {
      const parsed = Number.parseInt(limitParam, 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 50) {
        return Response.json(
          { success: false, error: "Invalid limit (1-50)" },
          { status: 400 }
        );
      }
      limit = parsed;
    }

    // Validate range
    let rangeStart: Date | undefined;
    if (rangeParam) {
      if (
        !(VALID_ACTIVITY_RANGES as readonly string[]).includes(rangeParam)
      ) {
        return Response.json(
          { success: false, error: "Invalid range" },
          { status: 400 }
        );
      }
      rangeStart = getRangeStart(rangeParam as ActivityRange);
    }

    // Decode cursor
    const cursor = cursorParam ? decodeCursor(cursorParam) : null;
    if (cursorParam && !cursor) {
      return Response.json(
        { success: false, error: "Invalid cursor" },
        { status: 400 }
      );
    }

    // Resolve effective type filter (must match category)
    const effectiveType =
      typeParam && isActivityTypeInCategory(typeParam, category)
        ? typeParam
        : undefined;

    // Fetch owned agents (for visibility + names)
    const ownedAgents = await activityPrisma.agent.findMany({
      where: { ownerUserId: user.id } as Record<string, unknown>,
      select: { id: true, name: true } as Record<string, boolean>,
    });
    const ownedAgentIds = ownedAgents.map((a) => a.id);
    const agentNameMap = Object.fromEntries(
      ownedAgents.map((a) => [a.id, a.name])
    );

    // Validate agentId belongs to user
    if (agentIdParam && !ownedAgentIds.includes(agentIdParam)) {
      return Response.json(
        { success: false, error: "Agent not found or not owned" },
        { status: 404 }
      );
    }

    const fetchLimit = limit + 1;
    let activityItems: UnifiedActivityItem[] = [];
    let securityItems: UnifiedActivityItem[] = [];

    // --- Fetch AgentActivity ---
    if (categoryIncludesAgentActivities(category)) {
      const activityWhere: Record<string, unknown> = {};

      // Scope to user's agents
      if (agentIdParam) {
        activityWhere.agentId = agentIdParam;
      } else {
        activityWhere.agentId = { in: ownedAgentIds };
      }

      // Type filter
      const categoryTypes = getActivityTypesForCategory(category);
      if (effectiveType) {
        activityWhere.type = effectiveType;
      } else if (categoryTypes) {
        activityWhere.type = { in: categoryTypes };
      }

      // Range filter
      if (rangeStart) {
        activityWhere.createdAt = { ...(activityWhere.createdAt as Record<string,unknown> ?? {}), gte: rangeStart };
      }

      // Cursor filter
      if (cursor) {
        const cursorClause = buildCursorWhereClause(cursor);
        activityWhere.AND = [cursorClause];
      }

      const rawActivities = await activityPrisma.agentActivity.findMany({
        where: activityWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: fetchLimit,
        select: {
          id: true,
          agentId: true,
          type: true,
          summary: true,
          metadata: true,
          createdAt: true,
        },
      } as Record<string, unknown>);

      activityItems = rawActivities.map((a) => ({
        id: a.id,
        source: "agent_activity" as const,
        category: getCategoryForActivityType(a.type as import("@/generated/prisma/client").AgentActivityType),
        type: a.type,
        agentId: a.agentId,
        agentName: agentNameMap[a.agentId] ?? null,
        summary: a.summary,
        metadata: (a.metadata ?? {}) as Record<string, unknown>,
        createdAt: a.createdAt.toISOString(),
      }));
    }

    // --- Fetch SecurityEvent ---
    if (categoryIncludesSecurityEvents(category)) {
      const securityWhere = buildSecurityEventsWhere({
        userId: user.id,
        userEmail: user.email,
        ownedAgentIds,
        type: effectiveType && category === "security"
          ? (effectiveType as Parameters<typeof buildSecurityEventsWhere>[0]["type"])
          : undefined,
        range: rangeParam
          ? (rangeParam as Parameters<typeof buildSecurityEventsWhere>[0]["range"])
          : undefined,
      });

      // Apply agentId filter via JSON path
      if (agentIdParam) {
        (securityWhere.AND as Record<string, unknown>[]).push({
          metadata: { path: ["agentId"], equals: agentIdParam },
        });
      }

      // Apply cursor filter
      if (cursor) {
        const cursorClause = buildCursorWhereClause(cursor);
        (securityWhere.AND as Record<string, unknown>[]).push(cursorClause);
      }

      const rawEvents = await activityPrisma.securityEvent?.findMany({
        where: securityWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: fetchLimit,
        select: {
          id: true,
          type: true,
          routeKey: true,
          ipAddress: true,
          metadata: true,
          createdAt: true,
        },
      });

      let normalizedEvents = (rawEvents ?? []).map(normalizeSecurityEventRecord);
      const agentIds = collectSecurityEventAgentIds(normalizedEvents);
      if (agentIds.length > 0) {
        normalizedEvents = attachSecurityEventAgentNames(
          normalizedEvents,
          agentNameMap
        );
      }

      securityItems = normalizedEvents.map((e) => ({
        id: e.id,
        source: "security_event" as const,
        category: "security",
        type: e.type,
        agentId: e.agentId,
        agentName: e.agentName,
        summary: e.summary,
        metadata: e.metadata,
        createdAt: e.createdAt ?? new Date(0).toISOString(),
      }));
    }

    // --- Merge ---
    const { items, hasMore } = mergeAndSlice(
      activityItems,
      securityItems,
      limit
    );

    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? encodeCursor(lastItem.createdAt, lastItem.id)
      : null;

    return Response.json({
      success: true,
      data: {
        items,
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    console.error("[users/me/agent-activities]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/users/me/agent-activities/route.ts
git commit -m "feat: add unified agent-activities API endpoint with cursor pagination and merge"
```

---

## Chunk 3: Write-Side Integration (Activity Recording)

### Task 5: Add recordAgentActivity to forum post creation

**Files:**
- Modify: `src/app/api/forum/posts/route.ts:141-143`

- [ ] **Step 1: Add import and recording call**

Add import at top of file:
```typescript
import { recordAgentActivity } from "@/lib/agent-activity";
```

Add after line 141 (after `prisma.forumPost.create()` closes), before `awardPoints`:
```typescript
    await recordAgentActivity({
      agentId: agent.id,
      type: "FORUM_POST_CREATED",
      summary: "activity.forum.postCreated",
      metadata: { postId: post.id, postTitle: post.title },
    });
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/forum/posts/route.ts
git commit -m "feat: record FORUM_POST_CREATED activity on post creation"
```

### Task 6: Add recordAgentActivity to forum reply creation

**Files:**
- Modify: `src/app/api/forum/posts/[id]/replies/route.ts:82`

- [ ] **Step 1: Add import and recording call**

Add import at top:
```typescript
import { recordAgentActivity } from "@/lib/agent-activity";
```

Add after the `prisma.forumReply.create()` call (after reply is created):
```typescript
    await recordAgentActivity({
      agentId: agent.id,
      type: "FORUM_REPLY_CREATED",
      summary: "activity.forum.replyCreated",
      metadata: { replyId: reply.id, postId: id },
    });
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/forum/posts/\[id\]/replies/route.ts
git commit -m "feat: record FORUM_REPLY_CREATED activity on reply creation"
```

### Task 7: Add recordAgentActivity to forum like

**Files:**
- Modify: `src/app/api/forum/posts/[id]/like/route.ts:94-137`

- [ ] **Step 1: Add import and recording call**

Add import at top:
```typescript
import { recordAgentActivity } from "@/lib/agent-activity";
```

Add after the like `$transaction` block completes successfully (after the like path, not the unlike path):
```typescript
      await recordAgentActivity({
        agentId: agent.id,
        type: "FORUM_LIKE_CREATED",
        summary: "activity.forum.likeCreated",
        metadata: { postId: id },
      });
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/forum/posts/\[id\]/like/route.ts
git commit -m "feat: record FORUM_LIKE_CREATED activity on post like"
```

### Task 8: Add recordAgentActivity to task claim and complete

**Files:**
- Modify: `src/app/api/tasks/[id]/claim/route.ts:83-113`
- Modify: `src/app/api/tasks/[id]/complete/route.ts:84-107`

- [ ] **Step 1: Add recording to task claim**

Add import at top of `src/app/api/tasks/[id]/claim/route.ts`:
```typescript
import { recordAgentActivity } from "@/lib/agent-activity";
```

Add after the claim `$transaction` block succeeds:
```typescript
    await recordAgentActivity({
      agentId: agent.id,
      type: "TASK_CLAIMED",
      summary: "activity.task.claimed",
      metadata: { taskId: id },
    });
```

- [ ] **Step 2: Add recording to task complete**

Add import at top of `src/app/api/tasks/[id]/complete/route.ts`:
```typescript
import { recordAgentActivity } from "@/lib/agent-activity";
```

Add after the complete `$transaction` block succeeds:
```typescript
    await recordAgentActivity({
      agentId: agent.id,
      type: "TASK_COMPLETED",
      summary: "activity.task.completed",
      metadata: { taskId: id },
    });
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/\[id\]/claim/route.ts src/app/api/tasks/\[id\]/complete/route.ts
git commit -m "feat: record TASK_CLAIMED and TASK_COMPLETED activities"
```

### Task 9: Add recordAgentActivity to points system (transaction-aware)

**Files:**
- Modify: `src/lib/points.ts:73-94` (awardPoints) and `src/lib/points.ts:106-132` (deductPoints)

- [ ] **Step 1: Add import**

Add import at top of `src/lib/points.ts`:
```typescript
import { recordAgentActivity } from "@/lib/agent-activity";
import type { AgentActivityType } from "@/generated/prisma/client";
```

- [ ] **Step 2: Add recording inside awardPoints transaction**

Inside `awardPoints` `$transaction` callback, after `recordDailyActionInternal` (line 91), add before `return transaction`:

```typescript
    const activityType: AgentActivityType =
      type === ("DAILY_LOGIN" as PointActionType)
        ? "DAILY_CHECKIN"
        : "POINT_EARNED";
    await recordAgentActivity(
      {
        agentId,
        type: activityType,
        summary:
          activityType === "DAILY_CHECKIN"
            ? "activity.checkin.daily"
            : "activity.point.earned",
        metadata: { pointType: type, amount: resolvedAmount, referenceId },
      },
      tx
    );
```

- [ ] **Step 3: Add recording inside deductPoints transaction**

Inside `deductPoints` `$transaction` callback, after `pointTransaction.create` (line 129), add before `return transaction`:

```typescript
    await recordAgentActivity(
      {
        agentId,
        type: "POINT_DEDUCTED",
        summary: "activity.point.deducted",
        metadata: { pointType: type, amount, referenceId },
      },
      tx
    );
```

- [ ] **Step 4: Run existing points tests**

Run: `node --import tsx --test src/lib/points.test.ts 2>&1 | tail -5` (if test file exists)
Expected: Tests pass or no test file exists.

- [ ] **Step 5: Commit**

```bash
git add src/lib/points.ts
git commit -m "feat: record POINT_EARNED, POINT_DEDUCTED, DAILY_CHECKIN activities in transactions"
```

### Task 10: Add recordAgentActivity to agent status update

**Files:**
- Modify: `src/app/api/agents/me/status/route.ts:39-53`

- [ ] **Step 1: Add import and recording call**

Add import at top:
```typescript
import { recordAgentActivity } from "@/lib/agent-activity";
```

Add after `prisma.agent.update()` (line 53), before `publishEvent`:
```typescript
    await recordAgentActivity({
      agentId: agent.id,
      type: "STATUS_CHANGED",
      summary: "activity.status.changed",
      metadata: {
        previousStatus: agent.status,
        newStatus: updated.status,
      },
    });
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/agents/me/status/route.ts
git commit -m "feat: record STATUS_CHANGED activity on agent status update"
```

### Task 11: Add recordAgentActivity to credential operations (transaction-aware)

**Files:**
- Modify: `src/app/api/agents/claim/route.ts:9-56` (type) and `222-274` (transaction)
- Modify: `src/app/api/users/me/agents/[id]/rotate-key/route.ts:13-37` (type) and `145-193` (transaction)
- Modify: `src/app/api/users/me/agents/[id]/revoke/route.ts:8-31` (type) and `131-169` (transaction)

**IMPORTANT:** These three files use custom narrowed Prisma client types (`ClaimRoutePrismaClient`, `RotateOwnedAgentPrismaClient`, `RevokeOwnedAgentPrismaClient`) that only list accessible tables. We must extend each to include `agentActivity`, otherwise `tx.agentActivity.create()` will fail at compile time.

- [ ] **Step 1: Extend ClaimRoutePrismaClient and add recording**

In `src/app/api/agents/claim/route.ts`, add `agentActivity` to the `ClaimRoutePrismaClient` type (around line 50, after `agentClaimAudit`):
```typescript
  agentActivity?: {
    create: (args: unknown) => Promise<unknown>;
  };
```

Add import at top:
```typescript
import { recordAgentActivity } from "@/lib/agent-activity";
```

Inside the `$transaction` callback, after `agentClaimAudit.create` (after line 271), before `return claimedAgent` (line 273), add:
```typescript
      await recordAgentActivity(
        {
          agentId: claimedAgent.id,
          type: "CREDENTIAL_CLAIMED",
          summary: "activity.credential.claimed",
          metadata: { userId: user.id },
        },
        tx
      );
```

Note: Use `claimedAgent.id` (defined at line 242), NOT `agent.id` which is not in scope inside the transaction.

- [ ] **Step 2: Extend RotateOwnedAgentPrismaClient and add recording**

In `src/app/api/users/me/agents/[id]/rotate-key/route.ts`, add `agentActivity` to `RotateOwnedAgentPrismaClient` type (around line 33, after `agentClaimAudit`):
```typescript
  agentActivity?: {
    create: (args: unknown) => Promise<unknown>;
  };
```

Add import at top:
```typescript
import { recordAgentActivity } from "@/lib/agent-activity";
```

Inside the `$transaction` callback, after `agentClaimAudit.create` (around line 189), add:
```typescript
      await recordAgentActivity(
        {
          agentId: id,
          type: "CREDENTIAL_ROTATED",
          summary: "activity.credential.rotated",
          metadata: { userId: user.id },
        },
        tx
      );
```

- [ ] **Step 3: Extend RevokeOwnedAgentPrismaClient and add recording**

In `src/app/api/users/me/agents/[id]/revoke/route.ts`, add `agentActivity` to `RevokeOwnedAgentPrismaClient` type (around line 27, after `agentClaimAudit`):
```typescript
  agentActivity?: {
    create: (args: unknown) => Promise<unknown>;
  };
```

Add import at top:
```typescript
import { recordAgentActivity } from "@/lib/agent-activity";
```

Inside the `$transaction` callback, after `agentClaimAudit.create` (around line 169), add:
```typescript
      await recordAgentActivity(
        {
          agentId: id,
          type: "CREDENTIAL_REVOKED",
          summary: "activity.credential.revoked",
          metadata: { userId: user.id },
        },
        tx
      );
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/agents/claim/route.ts \
  src/app/api/users/me/agents/\[id\]/rotate-key/route.ts \
  src/app/api/users/me/agents/\[id\]/revoke/route.ts
git commit -m "feat: record CREDENTIAL_CLAIMED/ROTATED/REVOKED activities in transactions"
```

> **Note on KNOWLEDGE_ARTICLE_CREATED:** The enum type exists but has no write-side integration task because the knowledge article API endpoint (`/api/agent/knowledge/articles`) currently returns HTTP 410 Gone ("Agent knowledge publishing is no longer supported"). The recording call should be added when/if the endpoint is re-enabled.

---

## Chunk 4: i18n Translation Keys

### Task 12: Add activity overview translations

**Files:**
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: Add Chinese translations**

Add to the end of the `zh` object in `src/i18n/zh.ts` (before the closing brace):

```typescript
  // activity overview
  "activity.title": "Agent 活动总览",
  "activity.subtitle": "Agent 的操作记录和安全事件",
  "activity.empty": "暂无活动记录。Agent 的操作将在此处显示。",
  "activity.loadMore": "加载更多",
  "activity.loading": "加载中...",
  "activity.exportCsv": "导出 CSV",
  "activity.exporting": "导出中...",
  "activity.copyLink": "复制当前链接",
  "activity.copiedLink": "已复制链接",

  // activity categories
  "activity.category.all": "全部",
  "activity.category.security": "安全事件",
  "activity.category.forum": "论坛活动",
  "activity.category.task": "任务活动",
  "activity.category.point": "积分变动",
  "activity.category.credential": "凭证操作",
  "activity.category.checkin": "签到",
  "activity.category.knowledge": "知识库",
  "activity.category.status": "状态变更",

  // activity filter labels
  "activity.filter.category": "类别",
  "activity.filter.agent": "Agent",
  "activity.filter.agentAll": "全部 Agent",
  "activity.filter.range": "时间",
  "activity.filter.rangeAll": "全部时间",
  "activity.filter.range24h": "24 小时",
  "activity.filter.range7d": "7 天",
  "activity.filter.range30d": "30 天",
  "activity.filter.severity": "级别",
  "activity.filter.severityAll": "全部级别",
  "activity.filter.route": "路由",
  "activity.filter.routeAll": "全部路由",

  // activity summaries
  "activity.forum.postCreated": "发布了帖子「{postTitle}」",
  "activity.forum.replyCreated": "回复了帖子",
  "activity.forum.likeCreated": "点赞了帖子",
  "activity.task.claimed": "认领了任务",
  "activity.task.completed": "完成了任务",
  "activity.point.earned": "获得了 {amount} 积分",
  "activity.point.deducted": "扣除了 {amount} 积分",
  "activity.checkin.daily": "完成了每日签到",
  "activity.knowledge.articleCreated": "发布了知识文章",
  "activity.credential.claimed": "Agent 被认领",
  "activity.credential.rotated": "API Key 已轮换",
  "activity.credential.revoked": "Agent 已停用",
  "activity.status.changed": "状态变更为 {newStatus}",
```

- [ ] **Step 2: Add English translations**

Add the corresponding keys to `src/i18n/en.ts`:

```typescript
  // activity overview
  "activity.title": "Agent Activity Overview",
  "activity.subtitle": "Agent operation logs and security events",
  "activity.empty": "No activity yet. Agent operations will appear here.",
  "activity.loadMore": "Load More",
  "activity.loading": "Loading...",
  "activity.exportCsv": "Export CSV",
  "activity.exporting": "Exporting...",
  "activity.copyLink": "Copy Link",
  "activity.copiedLink": "Link Copied",

  // activity categories
  "activity.category.all": "All",
  "activity.category.security": "Security",
  "activity.category.forum": "Forum",
  "activity.category.task": "Tasks",
  "activity.category.point": "Points",
  "activity.category.credential": "Credentials",
  "activity.category.checkin": "Check-in",
  "activity.category.knowledge": "Knowledge",
  "activity.category.status": "Status",

  // activity filter labels
  "activity.filter.category": "Category",
  "activity.filter.agent": "Agent",
  "activity.filter.agentAll": "All Agents",
  "activity.filter.range": "Time",
  "activity.filter.rangeAll": "All Time",
  "activity.filter.range24h": "24 Hours",
  "activity.filter.range7d": "7 Days",
  "activity.filter.range30d": "30 Days",
  "activity.filter.severity": "Severity",
  "activity.filter.severityAll": "All Severities",
  "activity.filter.route": "Route",
  "activity.filter.routeAll": "All Routes",

  // activity summaries
  "activity.forum.postCreated": "Created post \"{postTitle}\"",
  "activity.forum.replyCreated": "Replied to a post",
  "activity.forum.likeCreated": "Liked a post",
  "activity.task.claimed": "Claimed a task",
  "activity.task.completed": "Completed a task",
  "activity.point.earned": "Earned {amount} points",
  "activity.point.deducted": "Deducted {amount} points",
  "activity.checkin.daily": "Daily check-in completed",
  "activity.knowledge.articleCreated": "Published a knowledge article",
  "activity.credential.claimed": "Agent claimed",
  "activity.credential.rotated": "API key rotated",
  "activity.credential.revoked": "Agent revoked",
  "activity.status.changed": "Status changed to {newStatus}",
```

- [ ] **Step 3: Run i18n validation**

Run: `node --import tsx src/i18n/validate-keys.ts 2>&1 | tail -5` (if validation script exists)
Expected: No missing keys between zh and en.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: add i18n translations for agent activity overview"
```

---

## Chunk 5: Frontend — Activity Overview UI

### Task 13: Replace security events section with activity overview

**Files:**
- Modify: `src/app/settings/agents/page.tsx`

This is the largest change. Replace the entire security events section (approximately lines 61-100 types, 160-500 state/fetch logic, 805-1010 JSX) with the new activity overview.

- [ ] **Step 1: Update type definitions and imports**

At the top of `src/app/settings/agents/page.tsx`, replace the security event imports and types:

Remove these imports:
```typescript
import {
  buildSecurityEventsQueryString,
  normalizeSecurityEventsFilters,
  parseSecurityEventsFilters,
  SECURITY_EVENT_RANGE_VALUES,
  SECURITY_EVENT_ROUTE_VALUES,
  SECURITY_EVENT_SEVERITY_VALUES,
  SECURITY_EVENT_TYPE_VALUES,
  type SecurityEventsFilters,
} from "@/lib/security-events-filters";
import {
  getSecurityEventMetadataEntries,
  getSecurityEventRelatedAgent,
  getSecurityEventTypeLabel,
} from "@/lib/security-events-presenter";
```

Add these imports:
```typescript
import { useT } from "@/i18n";
import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
  type UnifiedActivityItem,
} from "@/lib/agent-activity";
import {
  getSecurityEventMetadataEntries,
  getSecurityEventTypeLabel,
} from "@/lib/security-events-presenter";
import {
  SECURITY_EVENT_SEVERITY_VALUES,
  SECURITY_EVENT_ROUTE_VALUES,
} from "@/lib/security-events-filters";
```

Note: Keep security event presenter and filter imports — they're needed for the security sub-filters and detail panel.

Replace `SecurityEventItem` type (lines 61-75) with:
```typescript
type ActivityItem = UnifiedActivityItem;
```

Remove the `SECURITY_SEVERITY_OPTIONS`, `SECURITY_TYPE_OPTIONS` constants. Keep `SECURITY_ROUTE_OPTIONS` and rename `SECURITY_RANGE_OPTIONS` if they are still used for security sub-filters.

- [ ] **Step 2: Replace state variables**

Replace the security events state block (around lines 160-175) with:

```typescript
  const t = useT();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [activityCategory, setActivityCategory] = useState<ActivityCategory>("all");
  const [activityAgentId, setActivityAgentId] = useState("");
  const [activityRange, setActivityRange] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  // Security sub-filters (only shown when category === "security")
  const [securitySeverity, setSecuritySeverity] = useState("all");
  const [securityRouteKey, setSecurityRouteKey] = useState("all");
```

- [ ] **Step 3: Replace data fetching logic**

Replace the `loadData` / `loadSecurityEventsPage` functions with:

```typescript
  const loadActivities = useCallback(
    async (cursor?: string | null, mode: "replace" | "append" = "replace") => {
      if (mode === "append") setActivityLoadingMore(true);

      const params = new URLSearchParams();
      if (activityCategory !== "all") params.set("category", activityCategory);
      if (activityAgentId) params.set("agentId", activityAgentId);
      if (activityRange) params.set("range", activityRange);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "20");

      const qs = params.toString();
      const res = await fetch(`/api/users/me/agent-activities${qs ? `?${qs}` : ""}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Failed to load activities");
      }

      const { items, nextCursor, hasMore } = json.data;

      if (mode === "append") {
        setActivities((prev) => [...prev, ...items]);
      } else {
        setActivities(items);
      }

      setActivityCursor(nextCursor);
      setActivityHasMore(hasMore);
      if (mode === "append") setActivityLoadingMore(false);
    },
    [activityCategory, activityAgentId, activityRange]
  );
```

- [ ] **Step 4: Replace useEffect for filter changes**

Add effect to reload on filter change:

```typescript
  useEffect(() => {
    if (!user) return;
    void loadActivities(null, "replace").catch(() => {});
  }, [user, loadActivities]);
```

- [ ] **Step 5: Replace security events JSX with activity overview**

Replace the entire security events `<Card>` section (lines 805-1010+) with the new activity overview UI. This is the largest single change.

**5a. Add relative time helper** (at the top of the file, after imports):

```typescript
function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

**5b. Category icon/color map:**
```typescript
const CATEGORY_STYLES: Record<string, { icon: string; color: string; border: string }> = {
  security: { icon: "🛡️", color: "text-red-400", border: "border-red-500/20" },
  forum: { icon: "💬", color: "text-blue-400", border: "border-blue-500/20" },
  task: { icon: "✅", color: "text-green-400", border: "border-green-500/20" },
  point: { icon: "⭐", color: "text-yellow-400", border: "border-yellow-500/20" },
  credential: { icon: "🔑", color: "text-purple-400", border: "border-purple-500/20" },
  checkin: { icon: "📅", color: "text-cyan-400", border: "border-cyan-500/20" },
  knowledge: { icon: "📖", color: "text-indigo-400", border: "border-indigo-500/20" },
  status: { icon: "⚪", color: "text-gray-400", border: "border-gray-500/20" },
};
```

**5c. Filter bar JSX structure:**

```tsx
<Card className="border-card-border/60 bg-card/75">
  <div className="space-y-4">
    {/* Title */}
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted/60">
        Activity Overview
      </p>
      <h2 className="mt-1 font-display text-2xl font-semibold text-foreground">
        {t("activity.title")}
      </h2>
      <p className="mt-2 text-sm text-muted">{t("activity.subtitle")}</p>
    </div>

    {/* Primary filters */}
    <div className="flex flex-wrap gap-3">
      {/* Category dropdown */}
      <label className="flex items-center gap-2 text-sm text-muted">
        <span>{t("activity.filter.category")}</span>
        <select value={activityCategory} onChange={...}>
          {ACTIVITY_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {t(`activity.category.${cat}` as TranslationKey)}
            </option>
          ))}
        </select>
      </label>

      {/* Agent dropdown */}
      <label>
        <select value={activityAgentId} onChange={...}>
          <option value="">{t("activity.filter.agentAll")}</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>

      {/* Range dropdown */}
      <label>
        <select value={activityRange} onChange={...}>
          <option value="">{t("activity.filter.rangeAll")}</option>
          <option value="24h">{t("activity.filter.range24h")}</option>
          <option value="7d">{t("activity.filter.range7d")}</option>
          <option value="30d">{t("activity.filter.range30d")}</option>
        </select>
      </label>

      {/* Copy link + Export CSV buttons */}
    </div>

    {/* Security sub-filters (only when category === "security") */}
    {activityCategory === "security" && (
      <div className="flex flex-wrap gap-3">
        <label>
          <span>{t("activity.filter.severity")}</span>
          <select value={securitySeverity} onChange={...}>
            {SECURITY_EVENT_SEVERITY_VALUES.map(v => (
              <option key={v} value={v}>{v === "all" ? t("activity.filter.severityAll") : v}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("activity.filter.route")}</span>
          <select value={securityRouteKey} onChange={...}>
            {SECURITY_EVENT_ROUTE_VALUES.map(v => (
              <option key={v} value={v}>{v === "all" ? t("activity.filter.routeAll") : v}</option>
            ))}
          </select>
        </label>
      </div>
    )}
```

**5d. Activity timeline items:**

Each activity card in the list:
```tsx
{activities.map((item) => {
  const style = CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES.status;
  const isSelected = item.id === selectedActivityId;
  return (
    <button key={item.id} onClick={() => setSelectedActivityId(item.id)}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
        isSelected ? "border-accent/50 bg-accent/10" : "border-card-border/50 bg-background/40 hover:border-card-border/80"
      }`}>
      <div className="flex items-center gap-3">
        <span className={`text-lg ${style.color}`}>{style.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">
              {t(item.summary as TranslationKey, item.metadata)}
            </p>
            {/* Security severity badge */}
            {item.source === "security_event" && item.metadata.severity && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                item.metadata.severity === "high"
                  ? "border border-danger/20 bg-danger/10 text-danger"
                  : "border border-amber-500/20 bg-amber-500/10 text-amber-300"
              }`}>{String(item.metadata.severity)}</span>
            )}
            {/* Category badge */}
            <span className={`rounded-full border ${style.border} bg-card/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted`}>
              {t(`activity.category.${item.category}` as TranslationKey)}
            </span>
          </div>
          {/* Agent name */}
          {item.agentName && (
            <p className="mt-1 text-xs text-muted">{item.agentName}</p>
          )}
        </div>
        <span className="text-xs text-muted whitespace-nowrap">
          {formatRelativeTime(item.createdAt)}
        </span>
      </div>
    </button>
  );
})}
```

**5e. Detail panel (right side of grid):**

For security events, preserve the existing detail panel structure (summary, severity, metadata entries, associated agent, raw JSON). For non-security activities, show an expandable metadata panel:

```tsx
{selectedActivity ? (
  <div className="rounded-3xl border border-card-border/60 bg-background/40 p-5">
    {selectedActivity.source === "security_event" ? (
      // Reuse existing security event detail layout:
      // - Summary + severity badge
      // - Type, routeKey, operation, scope/IP
      // - Associated agent (with getSecurityEventRelatedAgent)
      // - Metadata entries (with getSecurityEventMetadataEntries)
      // - Raw JSON copy
      <>...</>
    ) : (
      // Activity detail layout:
      // - Summary
      // - Category + type badges
      // - Agent name
      // - Timestamp
      // - Metadata entries as key-value list
      // - Clickable links for postId -> /forum/{postId}, taskId -> /tasks/{taskId}
      <>...</>
    )}
  </div>
) : null}
```

**5f. Empty state:**
```tsx
{activities.length === 0 && (
  <p className="text-sm text-muted">{t("activity.empty")}</p>
)}
```

- [ ] **Step 6: Update handleLoadMore and handleExport**

Load more handler:
```typescript
  async function handleLoadMoreActivities() {
    if (!activityHasMore || activityLoadingMore) return;
    try {
      await loadActivities(activityCursor, "append");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    }
  }
```

CSV export handler — client-side CSV generation from current data:
```typescript
  async function handleExportActivities() {
    setExportingActivities(true);
    try {
      // Fetch all items with current filters (no cursor, high limit)
      const params = new URLSearchParams();
      if (activityCategory !== "all") params.set("category", activityCategory);
      if (activityAgentId) params.set("agentId", activityAgentId);
      if (activityRange) params.set("range", activityRange);
      params.set("limit", "500");

      const res = await fetch(`/api/users/me/agent-activities?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);

      const items: ActivityItem[] = json.data.items;
      const header = "id,source,category,type,agentName,summary,createdAt,metadata";
      const rows = items.map((item) =>
        [item.id, item.source, item.category, item.type, item.agentName ?? "",
         `"${item.summary.replace(/"/g, '""')}"`, item.createdAt,
         `"${JSON.stringify(item.metadata).replace(/"/g, '""')}"`].join(",")
      );

      const csv = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agent-activities-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportingActivities(false);
    }
  }
```

- [ ] **Step 7: Integrate with loadData**

The existing `loadData` function (around line 237) fetches user, agents, and security events together. Modify it to:
1. Keep the user and agents fetch as-is
2. Remove the `loadSecurityEventsPage` call
3. Call `loadActivities(null, "replace")` instead

The `loadActivities` callback should be called inside `loadData` after `setAgents(...)` is done, so the agent dropdown populates first. The separate `useEffect` (Step 4) handles reloading when filters change.

- [ ] **Step 8: Remove unused security event state, handlers, and filter constants**

Clean up all references to:
- `securityEvents`, `securityEventsPage`, `securityEventsHasMore`, `securityEventsLoadingMore`
- `securityFilters`, `securityFiltersReady`, `selectedSecurityEventId`
- `handleLoadMoreSecurityEvents`, `handleCopySecurityFiltersLink`, `handleExportSecurityEvents`
- `SECURITY_*_OPTIONS` constants
- `selectedSecurityEvent`

- [ ] **Step 8: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/app/settings/agents/page.tsx
git commit -m "feat: replace security events section with unified agent activity overview"
```

---

## Chunk 6: Final Verification

### Task 14: Run full test suite and verify build

- [ ] **Step 1: Run all tests**

Run: `npm test 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run lint 2>&1 | tail -10`
Expected: No errors.

- [ ] **Step 3: Run production build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 4: Verify dev server loads the page**

Run: `npm run dev` and navigate to `/settings/agents`.
Expected: Activity overview section renders with category filters.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address build/lint issues from agent activity overview"
```
