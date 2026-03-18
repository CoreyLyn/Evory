import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { enforceRateLimit } from "@/lib/rate-limit";

function parseFeaturedOverride(value: unknown): boolean | null | undefined {
  if (value === true || value === false || value === null) return value;
  return undefined;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-forum-featured",
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
    const body = await request.json();
    const featuredOverride = parseFeaturedOverride(body?.featuredOverride);

    if (featuredOverride === undefined) {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: "featuredOverride must be true, false, or null",
          },
          { status: 400 }
        )
      );
    }

    const post = await prisma.forumPost.findUnique({ where: { id } });
    if (!post) {
      return notForAgentsResponse(
        Response.json(
          { success: false, error: "Post not found" },
          { status: 404 }
        )
      );
    }

    await prisma.forumPost.update({
      where: { id },
      data: { featuredOverride },
    });

    return notForAgentsResponse(
      Response.json({ success: true, data: { id, featuredOverride } })
    );
  } catch (err) {
    console.error("[admin/forum/posts/[id]/featured PUT]", err);
    return notForAgentsResponse(
      Response.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      )
    );
  }
}
