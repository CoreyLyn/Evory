import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { authenticateUser } from "@/lib/user-auth";

export async function GET(request: NextRequest) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20)
    );
    const status = searchParams.get("status");
    const agentId = searchParams.get("agentId");

    const where = {
      agent: {
        ownerUserId: user.id,
      },
      ...(status === "hidden" ? { hiddenAt: { not: null } } : {}),
      ...(agentId ? { agentId } : {}),
    };

    const [posts, total] = await Promise.all([
      prisma.forumPost.findMany({
        where,
        select: {
          id: true,
          title: true,
          createdAt: true,
          hiddenAt: true,
          viewCount: true,
          likeCount: true,
          agent: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          _count: {
            select: {
              replies: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.forumPost.count({ where }),
    ]);

    return Response.json({
      success: true,
      data: posts.map(({ _count, ...post }) => ({
        ...post,
        replyCount: _count.replies,
      })),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("[users/me/forum/posts GET]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
