import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import {
  attachSecurityEventAgentNames,
  buildSecurityEventsWhere,
  collectSecurityEventAgentIds,
  normalizeSecurityEventRecord,
  VALID_SECURITY_EVENT_RANGES,
  VALID_SECURITY_EVENT_SEVERITIES,
} from "@/lib/security-events";
import { authenticateUser } from "@/lib/user-auth";

type SecurityEventsPrismaClient = {
  agent: {
    findMany: (args: unknown) => Promise<
      Array<{
        id: string;
        name: string;
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

const securityEventsPrisma = prisma as unknown as SecurityEventsPrismaClient;

export async function GET(request: NextRequest) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const severity = request.nextUrl.searchParams.get("severity")?.trim() ?? "";
    const routeKey = request.nextUrl.searchParams.get("routeKey")?.trim() ?? "";
    const range = request.nextUrl.searchParams.get("range")?.trim() ?? "";
    const limitParam = request.nextUrl.searchParams.get("limit")?.trim() ?? "";
    const pageParam = request.nextUrl.searchParams.get("page")?.trim() ?? "";

    if (
      severity &&
      !VALID_SECURITY_EVENT_SEVERITIES.includes(
        severity as (typeof VALID_SECURITY_EVENT_SEVERITIES)[number]
      )
    ) {
      return Response.json(
        { success: false, error: "Invalid severity filter" },
        { status: 400 }
      );
    }

    if (
      range &&
      !VALID_SECURITY_EVENT_RANGES.includes(
        range as (typeof VALID_SECURITY_EVENT_RANGES)[number]
      )
    ) {
      return Response.json(
        { success: false, error: "Invalid time range filter" },
        { status: 400 }
      );
    }

    let limit = 10;
    if (limitParam) {
      const parsedLimit = Number.parseInt(limitParam, 10);

      if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
        return Response.json(
          { success: false, error: "Invalid limit filter" },
          { status: 400 }
        );
      }

      limit = parsedLimit;
    }

    let page = 1;
    if (pageParam) {
      const parsedPage = Number.parseInt(pageParam, 10);

      if (!Number.isFinite(parsedPage) || parsedPage < 1) {
        return Response.json(
          { success: false, error: "Invalid page filter" },
          { status: 400 }
        );
      }

      page = parsedPage;
    }

    const where = buildSecurityEventsWhere(user.id, {
      severity: severity
        ? (severity as (typeof VALID_SECURITY_EVENT_SEVERITIES)[number])
        : undefined,
      routeKey: routeKey || undefined,
      range: range
        ? (range as (typeof VALID_SECURITY_EVENT_RANGES)[number])
        : undefined,
    });

    const events = await securityEventsPrisma.securityEvent?.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * limit,
      take: limit + 1,
      select: {
        id: true,
        type: true,
        routeKey: true,
        ipAddress: true,
        metadata: true,
        createdAt: true,
      },
    });

    const normalizedEvents = (events ?? []).map(normalizeSecurityEventRecord);
    const hasMore = normalizedEvents.length > limit;
    let data = hasMore ? normalizedEvents.slice(0, limit) : normalizedEvents;
    const associatedAgentIds = collectSecurityEventAgentIds(data);

    if (associatedAgentIds.length > 0) {
      const agentRows = await securityEventsPrisma.agent.findMany({
        where: {
          ownerUserId: user.id,
          id: {
            in: associatedAgentIds,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      data = attachSecurityEventAgentNames(
        data,
        Object.fromEntries(agentRows.map((agent) => [agent.id, agent.name]))
      );
    }

    return Response.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        hasMore,
        nextPage: hasMore ? page + 1 : null,
      },
    });
  } catch (error) {
    console.error("[users/me/security-events]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
