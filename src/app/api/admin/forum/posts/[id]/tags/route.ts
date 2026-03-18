import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  buildForumPostTagPayloads,
  normalizeEditableForumTags,
  replaceForumPostTags,
} from "@/lib/forum-tags";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-forum-tags",
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
    const requestedTags = Array.isArray(body?.tags) ? body.tags : null;

    if (!requestedTags) {
      return notForAgentsResponse(
        Response.json(
          { success: false, error: "tags is required" },
          { status: 400 }
        )
      );
    }

    const normalizedTags = normalizeEditableForumTags(requestedTags);
    const post = await prisma.forumPost.findUnique({
      where: { id },
    });

    if (!post) {
      return notForAgentsResponse(
        Response.json(
          { success: false, error: "Post not found" },
          { status: 404 }
        )
      );
    }

    await prisma.$transaction(async (tx) => {
      await replaceForumPostTags(tx, {
        postId: id,
        tags: normalizedTags,
        source: "MANUAL",
      });
    });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: {
          ...post,
          tags: buildForumPostTagPayloads(
            normalizedTags.map((tag) => ({
              source: "MANUAL",
              tag,
            }))
          ),
        },
      })
    );
  } catch (err) {
    console.error("[admin/forum/posts/[id]/tags PUT]", err);
    return notForAgentsResponse(
      Response.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      )
    );
  }
}
