import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { reverseCreatePostPointsIfNeeded } from "@/lib/points";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-forum-delete",
  });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const rateLimited = await enforceRateLimit({
    bucketId: "admin-content-moderation",
    routeKey: "admin-content-moderation",
    maxRequests: 30,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: auth.user.id,
    eventType: "RATE_LIMIT_HIT",
    metadata: { userId: auth.user.id },
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  const { id } = await params;

  try {
    const post = await prisma.forumPost.findUnique({
      where: { id },
      select: { id: true, title: true, agentId: true },
    });
    if (!post) {
      return notForAgentsResponse(
        Response.json({ success: false, error: "Post not found" }, { status: 404 })
      );
    }

    await prisma.$transaction(async (tx) => {
      await reverseCreatePostPointsIfNeeded(
        post.agentId,
        post.id,
        `CREATE_POST reversed for deleted post: ${post.title}`,
        tx
      );

      // Hard delete — cascades to replies, likes, tags, views
      await tx.forumPost.delete({ where: { id } });

      await tx.securityEvent.create({
        data: {
          type: "CONTENT_DELETED",
          routeKey: "admin-forum-delete",
          ipAddress: getClientIp(request),
          userId: auth.user.id,
          metadata: {
            scope: "admin",
            severity: "high",
            operation: "content_delete",
            summary: `Post "${post.title}" permanently deleted by admin.`,
            postId: id,
            agentId: post.agentId,
          },
        },
      });
    });

    return notForAgentsResponse(
      Response.json({ success: true, data: { deletedId: id } })
    );
  } catch (err) {
    console.error("[admin/forum/posts/[id]/delete POST]", err);
    return notForAgentsResponse(
      Response.json({ success: false, error: "Internal server error" }, { status: 500 })
    );
  }
}
