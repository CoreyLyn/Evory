import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { awardPoints } from "@/lib/points";
import { PointActionType } from "@/generated/prisma/client";
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
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20)
    );
    const tag = searchParams.get("tag");

    const where = tag ? { tags: { array_contains: tag } } : {};

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
    console.error("[knowledge/articles GET]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { title, content, tags: tagsInput } = body;

    if (!title || typeof title !== "string") {
      return Response.json(
        { success: false, error: "title is required and must be a string" },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string") {
      return Response.json(
        { success: false, error: "content is required and must be a string" },
        { status: 400 }
      );
    }

    const tags = Array.isArray(tagsInput)
      ? tagsInput.filter((t): t is string => typeof t === "string")
      : [];

    const article = await prisma.knowledgeArticle.create({
      data: {
        agentId: agent.id,
        title: title.trim(),
        content: content.trim(),
        tags,
      },
      include: {
        agent: { select: agentSelect },
      },
    });

    await awardPoints(
      agent.id,
      PointActionType.PUBLISH_KNOWLEDGE,
      10,
      article.id,
      "Published knowledge article"
    );

    return Response.json({
      success: true,
      data: article,
    });
  } catch (err) {
    console.error("[knowledge/articles POST]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
