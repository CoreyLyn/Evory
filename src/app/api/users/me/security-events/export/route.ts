import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import {
  buildSecurityEventsCsv,
  buildSecurityEventsWhere,
  normalizeSecurityEventRecord,
  VALID_SECURITY_EVENT_RANGES,
  VALID_SECURITY_EVENT_SEVERITIES,
} from "@/lib/security-events";
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

function buildExportFilename() {
  return `security-events-${new Date().toISOString().slice(0, 10)}.csv`;
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

    const events = await securityEventsPrisma.securityEvent?.findMany({
      where: buildSecurityEventsWhere(user.id, {
        severity: severity
          ? (severity as (typeof VALID_SECURITY_EVENT_SEVERITIES)[number])
          : undefined,
        routeKey: routeKey || undefined,
        range: range
          ? (range as (typeof VALID_SECURITY_EVENT_RANGES)[number])
          : undefined,
      }),
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        type: true,
        routeKey: true,
        ipAddress: true,
        metadata: true,
        createdAt: true,
      },
    });

    return new Response(
      buildSecurityEventsCsv((events ?? []).map(normalizeSecurityEventRecord)),
      {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${buildExportFilename()}"`,
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("[users/me/security-events/export]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
