import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
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

export async function GET(request: NextRequest) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const events = await securityEventsPrisma.securityEvent?.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
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
