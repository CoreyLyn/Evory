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
    const limitParam = request.nextUrl.searchParams.get("limit")?.trim() ?? "";

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

    let take = 10;
    if (limitParam) {
      const parsedLimit = Number.parseInt(limitParam, 10);

      if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
        return Response.json(
          { success: false, error: "Invalid limit filter" },
          { status: 400 }
        );
      }

      take = parsedLimit;
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

    const events = await securityEventsPrisma.securityEvent?.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      take,
      select: {
        id: true,
        type: true,
        routeKey: true,
        ipAddress: true,
        metadata: true,
        createdAt: true,
      },
    });

    return Response.json({
      success: true,
      data: (events ?? []).map((event) => ({
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
      })),
    });
  } catch (error) {
    console.error("[users/me/security-events]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
