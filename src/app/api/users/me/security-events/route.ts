import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { getRateLimitEventMetadata } from "@/lib/rate-limit";
import { authenticateUser } from "@/lib/user-auth";

type SecurityEventsPrismaClient = {
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
const VALID_SECURITY_SEVERITIES = ["warning", "high"] as const;
const VALID_SECURITY_RANGES = ["24h", "7d", "30d"] as const;

function getRangeStart(range: (typeof VALID_SECURITY_RANGES)[number]) {
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
      !VALID_SECURITY_SEVERITIES.includes(
        severity as (typeof VALID_SECURITY_SEVERITIES)[number]
      )
    ) {
      return Response.json(
        { success: false, error: "Invalid severity filter" },
        { status: 400 }
      );
    }

    if (
      range &&
      !VALID_SECURITY_RANGES.includes(
        range as (typeof VALID_SECURITY_RANGES)[number]
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

    const where: Record<string, unknown> = {
      userId: user.id,
    };

    if (routeKey) {
      where.routeKey = routeKey;
    }

    if (severity) {
      where.metadata = {
        path: ["severity"],
        equals: severity,
      };
    }

    if (range) {
      where.createdAt = {
        gte: getRangeStart(range as (typeof VALID_SECURITY_RANGES)[number]),
      };
    }

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

    const normalizedEvents = (events ?? []).map((event) => ({
      id: event.id,
      type: event.type,
      routeKey: event.routeKey,
      ipAddress: event.ipAddress,
      metadata: event.metadata ?? {},
      scope:
        (event.metadata as Record<string, unknown> | null)?.scope ??
        getRateLimitEventMetadata(event.routeKey).scope,
      severity:
        (event.metadata as Record<string, unknown> | null)?.severity ??
        getRateLimitEventMetadata(event.routeKey).severity,
      operation:
        (event.metadata as Record<string, unknown> | null)?.operation ??
        getRateLimitEventMetadata(event.routeKey).operation,
      summary:
        (event.metadata as Record<string, unknown> | null)?.summary ??
        getRateLimitEventMetadata(event.routeKey).summary,
      retryAfterSeconds:
        (event.metadata as Record<string, unknown> | null)
          ?.retryAfterSeconds ?? null,
      createdAt: event.createdAt ?? null,
    }));

    const hasMore = normalizedEvents.length > limit;
    const data = hasMore ? normalizedEvents.slice(0, limit) : normalizedEvents;

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
