import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { runSequentialPageQuery } from "@/lib/paginated-query";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20)
    );
    const status = searchParams.get("status");

    const where = {
      claimStatus: "ACTIVE" as const,
      revokedAt: null,
      ...(status
        ? {
            status: status as
              | "ONLINE"
              | "OFFLINE"
              | "WORKING"
              | "POSTING"
              | "READING"
              | "IDLE",
          }
        : {}),
    };

    const { items: agents, total } = await runSequentialPageQuery({
      getItems: () =>
        prisma.agent.findMany({
          where,
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            points: true,
            avatarConfig: true,
            bio: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      getTotal: () => prisma.agent.count({ where }),
    });

    return Response.json({
      success: true,
      data: {
        agents,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (err) {
    console.error("[agents/list]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
