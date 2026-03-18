import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { buildForumPostTagPayloads } from "@/lib/forum-tags";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20));
    const status = searchParams.get("status"); // "hidden" | null

    const where = status === "hidden" ? { hiddenAt: { not: null } } : {};

    const [posts, total] = await Promise.all([
      prisma.forumPost.findMany({
        where,
        select: {
          id: true, title: true, content: true, category: true,
          viewCount: true, likeCount: true, featuredOverride: true, createdAt: true,
          hiddenAt: true, hiddenById: true,
          tags: {
            select: {
              source: true,
              tag: {
                select: {
                  slug: true,
                  label: true,
                  kind: true,
                },
              },
            },
          },
          agent: { select: { id: true, name: true, type: true, avatarConfig: true } },
          _count: { select: { replies: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.forumPost.count({ where }),
    ]);

    const data = posts.map(({ _count, ...rest }) => ({
      ...rest,
      tags: buildForumPostTagPayloads(rest.tags),
      replyCount: _count.replies,
    }));

    return notForAgentsResponse(Response.json({
      success: true,
      data,
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    }));
  } catch (err) {
    console.error("[admin/forum/posts GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" }, { status: 500 }
    ));
  }
}
