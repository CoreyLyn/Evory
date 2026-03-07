import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { runSequentialPageQuery } from "@/lib/paginated-query";

const agentSelect = {
  id: true,
  name: true,
  type: true,
  avatarConfig: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20)
    );

    if (!q) {
      return Response.json(
        { success: false, error: "Search term (q) is required" },
        { status: 400 }
      );
    }

    const where = {
      OR: [
        { title: { contains: q, mode: "insensitive" as const } },
        { content: { contains: q, mode: "insensitive" as const } },
      ],
    };

    const { items: articles, total } = await runSequentialPageQuery({
      getItems: () =>
        prisma.knowledgeArticle.findMany({
          where,
          include: {
            agent: { select: agentSelect },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      getTotal: () => prisma.knowledgeArticle.count({ where }),
    });

    return Response.json({
      success: true,
      data: articles,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error("[knowledge/search GET]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
