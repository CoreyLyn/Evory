import { NextRequest } from "next/server";

import {
  VALID_ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORIES,
  CATEGORY_ACTIVITY_TYPES,
  type ActivityCategory,
  normalizeAgentActivityRecord,
  normalizeSecurityEventToActivity,
  mergeActivities,
  parseCompositeCursor,
  buildCompositeCursor,
} from "@/lib/agent-activity";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  buildSecurityEventsWhere,
  normalizeSecurityEventRecord,
  collectSecurityEventAgentIds,
  attachSecurityEventAgentNames,
  getSecurityEventRangeStart,
  type SecurityEventApiRange,
  VALID_SECURITY_EVENT_RANGES,
} from "@/lib/security-events";
import { authenticateUser } from "@/lib/user-auth";

// ---------------------------------------------------------------------------
// Prisma type shim
// ---------------------------------------------------------------------------

type TypedClient = {
  agent: {
    findMany: (args: unknown) => Promise<
      Array<{
        id: string;
        name: string;
      }>
    >;
  };
  agentActivity?: {
    findMany: (args: unknown) => Promise<
      Array<{
        id: string;
        agentId: string;
        type: string;
        summary: string;
        metadata: unknown;
        createdAt: Date | string;
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

const typedPrisma = prisma as unknown as TypedClient;

// ---------------------------------------------------------------------------
// GET /api/users/me/agent-activities
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Rate limit
  const rateLimited = await enforceRateLimit({
    bucketId: "user-agent-activities",
    routeKey: "user-agent-activities",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: user.id,
    userId: user.id,
  });

  if (rateLimited) {
    return rateLimited;
  }

  try {
    // -----------------------------------------------------------------------
    // Parse query params
    // -----------------------------------------------------------------------

    const categoryParam =
      request.nextUrl.searchParams.get("category")?.trim() ?? "all";
    const agentIdParam =
      request.nextUrl.searchParams.get("agentId")?.trim() ?? "";
    const rangeParam =
      request.nextUrl.searchParams.get("range")?.trim() ?? "";
    const cursorParam =
      request.nextUrl.searchParams.get("cursor")?.trim() ?? "";
    const limitParam =
      request.nextUrl.searchParams.get("limit")?.trim() ?? "";

    // Validate category
    if (
      !VALID_ACTIVITY_CATEGORIES.includes(
        categoryParam as ActivityCategory
      )
    ) {
      return Response.json(
        { success: false, error: "Invalid category filter" },
        { status: 400 }
      );
    }
    const category = categoryParam as ActivityCategory;

    // Validate range
    if (
      rangeParam &&
      !VALID_SECURITY_EVENT_RANGES.includes(
        rangeParam as (typeof VALID_SECURITY_EVENT_RANGES)[number]
      )
    ) {
      return Response.json(
        { success: false, error: "Invalid time range filter" },
        { status: 400 }
      );
    }
    const range = rangeParam
      ? (rangeParam as SecurityEventApiRange)
      : undefined;

    // Validate limit
    let limit = 20;
    if (limitParam) {
      const parsedLimit = Number.parseInt(limitParam, 10);

      if (
        !Number.isFinite(parsedLimit) ||
        parsedLimit < 1 ||
        parsedLimit > 50
      ) {
        return Response.json(
          { success: false, error: "Invalid limit parameter" },
          { status: 400 }
        );
      }

      limit = parsedLimit;
    }

    // Validate cursor
    let cursor: { createdAt: string; id: string } | null = null;
    if (cursorParam) {
      cursor = parseCompositeCursor(cursorParam);

      if (!cursor) {
        return Response.json(
          { success: false, error: "Invalid cursor parameter" },
          { status: 400 }
        );
      }
    }

    // -----------------------------------------------------------------------
    // Fetch owned agents (for authorization & name mapping)
    // -----------------------------------------------------------------------

    const ownedAgents = await typedPrisma.agent.findMany({
      where: { ownerUserId: user.id },
      select: { id: true, name: true },
    });

    const ownedAgentIds = ownedAgents.map((a) => a.id);
    const agentNameMap = Object.fromEntries(
      ownedAgents.map((a) => [a.id, a.name])
    );

    // Validate agentId ownership
    if (agentIdParam && !ownedAgentIds.includes(agentIdParam)) {
      return Response.json(
        { success: false, error: "Agent not found or not owned by user" },
        { status: 403 }
      );
    }

    // -----------------------------------------------------------------------
    // Determine which tables to query
    // -----------------------------------------------------------------------

    const sourceConfig = ACTIVITY_CATEGORIES[category].source;
    const needsActivity =
      sourceConfig === "agent_activity" || sourceConfig === "both";
    const needsSecurity =
      sourceConfig === "security_event" || sourceConfig === "both";

    // Shared range start
    const rangeStart = range ? getSecurityEventRangeStart(range) : undefined;

    // Shared cursor conditions builder
    function buildCursorConditions(cursorDate: string, cursorId: string) {
      return {
        OR: [
          { createdAt: { lt: new Date(cursorDate) } },
          { createdAt: new Date(cursorDate), id: { lt: cursorId } },
        ],
      };
    }

    // -----------------------------------------------------------------------
    // Fetch AgentActivity records
    // -----------------------------------------------------------------------

    let activityItems: ReturnType<typeof normalizeAgentActivityRecord>[] = [];

    if (needsActivity) {
      const targetAgentIds = agentIdParam ? [agentIdParam] : ownedAgentIds;

      if (targetAgentIds.length > 0) {
        const activityWhere: Record<string, unknown> = {
          agentId: { in: targetAgentIds },
        };

        // Category-specific type filter
        if (
          category !== "all" &&
          category !== "security" &&
          CATEGORY_ACTIVITY_TYPES[category]
        ) {
          activityWhere.type = {
            in: CATEGORY_ACTIVITY_TYPES[category],
          };
        }

        // Range filter
        if (rangeStart) {
          activityWhere.createdAt = {
            ...(activityWhere.createdAt as Record<string, unknown> | undefined),
            gte: rangeStart,
          };
        }

        // Cursor filter
        if (cursor) {
          const cursorCond = buildCursorConditions(
            cursor.createdAt,
            cursor.id
          );
          activityWhere.AND = [cursorCond];
        }

        const rawActivities =
          (await typedPrisma.agentActivity?.findMany({
            where: activityWhere,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: limit + 1,
            select: {
              id: true,
              agentId: true,
              type: true,
              summary: true,
              metadata: true,
              createdAt: true,
            },
          })) ?? [];

        activityItems = rawActivities.map((r) =>
          normalizeAgentActivityRecord(r, agentNameMap[r.agentId] ?? null)
        );
      }
    }

    // -----------------------------------------------------------------------
    // Fetch SecurityEvent records
    // -----------------------------------------------------------------------

    let securityItems: ReturnType<
      typeof normalizeSecurityEventToActivity
    >[] = [];

    if (needsSecurity) {
      const baseWhere = buildSecurityEventsWhere({
        userId: user.id,
        userEmail: user.email,
        ownedAgentIds,
        range,
      });

      const securityAndClauses: Record<string, unknown>[] = [
        ...(baseWhere.AND ?? []),
      ];

      // agentId filter via JSON path
      if (agentIdParam) {
        securityAndClauses.push({
          metadata: { path: ["agentId"], equals: agentIdParam },
        });
      }

      // Cursor filter
      if (cursor) {
        securityAndClauses.push(
          buildCursorConditions(cursor.createdAt, cursor.id)
        );
      }

      const securityWhere = { AND: securityAndClauses };

      const rawEvents =
        (await typedPrisma.securityEvent?.findMany({
          where: securityWhere,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit + 1,
          select: {
            id: true,
            type: true,
            routeKey: true,
            ipAddress: true,
            metadata: true,
            createdAt: true,
          },
        })) ?? [];

      let normalizedEvents = rawEvents.map(normalizeSecurityEventRecord);

      // Attach agent names
      const associatedAgentIds =
        collectSecurityEventAgentIds(normalizedEvents);
      if (associatedAgentIds.length > 0) {
        const relevantNames = Object.fromEntries(
          ownedAgents
            .filter((a) => associatedAgentIds.includes(a.id))
            .map((a) => [a.id, a.name])
        );
        normalizedEvents = attachSecurityEventAgentNames(
          normalizedEvents,
          relevantNames
        );
      }

      securityItems = normalizedEvents.map(
        normalizeSecurityEventToActivity
      );
    }

    // -----------------------------------------------------------------------
    // Merge & paginate
    // -----------------------------------------------------------------------

    const hasMore =
      activityItems.length > limit || securityItems.length > limit;

    const merged = mergeActivities(
      [...activityItems, ...securityItems],
      limit
    );

    const lastItem = merged[merged.length - 1];
    const nextCursor = hasMore && lastItem
      ? buildCompositeCursor(lastItem.createdAt, lastItem.id)
      : null;

    return Response.json({
      success: true,
      data: {
        items: merged,
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
