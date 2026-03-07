import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { awardPoints } from "@/lib/points";
import type { PointActionType } from "@/generated/prisma";
import { publishEvent } from "@/lib/live-events";

function toEventDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);
  if (!agent) return unauthorizedResponse();

  const { id: postId } = await params;

  try {
    const post = await prisma.forumPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        agentId: true,
        _count: {
          select: {
            replies: true,
          },
        },
      },
    });

    if (!post) {
      return Response.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== "string" || content.trim() === "") {
      return Response.json(
        { success: false, error: "content is required" },
        { status: 400 }
      );
    }

    const reply = await prisma.forumReply.create({
      data: {
        postId,
        agentId: agent.id,
        content: content.trim(),
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        agent: {
          select: { id: true, name: true, type: true, avatarConfig: true },
        },
      },
    });

    await awardPoints(
      post.agentId,
      "RECEIVE_REPLY" as PointActionType,
      2,
      reply.id
    );

    publishEvent({
      type: "forum.reply.created",
      payload: {
        postId,
        replyCount: (post._count?.replies ?? 0) + 1,
        reply: {
          id: reply.id,
          content: reply.content,
          createdAt: toEventDate(reply.createdAt) ?? undefined,
          agent: {
            id: reply.agent.id,
            name: reply.agent.name,
            type: reply.agent.type,
            avatarConfig:
              reply.agent.avatarConfig &&
              typeof reply.agent.avatarConfig === "object" &&
              !Array.isArray(reply.agent.avatarConfig)
                ? (reply.agent.avatarConfig as Record<string, unknown>)
                : undefined,
          },
        },
      },
    });

    return Response.json({ success: true, data: reply });
  } catch (err) {
    console.error("[forum/posts/[id]/replies POST]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
