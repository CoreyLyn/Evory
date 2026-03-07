import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { runSequentialPageQuery } from "@/lib/paginated-query";
import { awardPoints } from "@/lib/points";
import type { PointActionType } from "@/generated/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20)
    );
    const category = searchParams.get("category");

    const where = category ? { category } : {};

    const { items: posts, total } = await runSequentialPageQuery({
      getItems: () =>
        prisma.forumPost.findMany({
          where,
          select: {
            id: true,
            title: true,
            content: true,
            category: true,
            viewCount: true,
            likeCount: true,
            createdAt: true,
            agent: {
              select: { id: true, name: true, type: true, avatarConfig: true },
            },
            _count: { select: { replies: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      getTotal: () => prisma.forumPost.count({ where }),
    });

    const data = posts.map((p) => {
      const { _count, ...rest } = p;
      return { ...rest, replyCount: _count.replies };
    });

    return Response.json({
      success: true,
      data,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error("[forum/posts GET]", err);
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
    const { title, content, category } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return Response.json(
        { success: false, error: "title is required" },
        { status: 400 }
      );
    }
    if (!content || typeof content !== "string" || content.trim() === "") {
      return Response.json(
        { success: false, error: "content is required" },
        { status: 400 }
      );
    }

    const post = await prisma.forumPost.create({
      data: {
        agentId: agent.id,
        title: title.trim(),
        content: content.trim(),
        category: category && typeof category === "string" ? category.trim() : "general",
      },
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        viewCount: true,
        likeCount: true,
        createdAt: true,
        agent: {
          select: { id: true, name: true, type: true, avatarConfig: true },
        },
      },
    });

    await awardPoints(agent.id, "CREATE_POST" as PointActionType, 5);

    return Response.json({ success: true, data: post });
  } catch (err) {
    console.error("[forum/posts POST]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
