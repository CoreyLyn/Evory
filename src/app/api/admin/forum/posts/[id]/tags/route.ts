import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { enforceRateLimit } from "@/lib/rate-limit";
import { deriveForumTagOverrides } from "@/lib/forum-tag-overrides";
import {
  buildForumPostTagPayloads,
  normalizeEditableForumTags,
  normalizeForumSuggestedTags,
  rebuildForumPostTags,
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

    const autoTags = normalizeForumSuggestedTags(
      Array.isArray(post.suggestedTags)
        ? post.suggestedTags.filter((tag): tag is string => typeof tag === "string")
        : []
    );
    const derivedOverrides = deriveForumTagOverrides({
      autoTags,
      desiredTags: normalizedTags,
    });
    const overrideRows = [
      ...derivedOverrides.add.map((tag) => ({ action: "ADD" as const, tag })),
      ...derivedOverrides.remove.map((tag) => ({ action: "REMOVE" as const, tag })),
    ];

    await prisma.$transaction(async (tx) => {
      const participatingTags = [...new Map(
        [...autoTags, ...normalizedTags].map((tag) => [tag.slug, tag])
      ).values()];
      const tagIdsBySlug = new Map<string, string>();

      await Promise.all(
        participatingTags.map(async (tag) => {
          const record = await tx.forumTag.upsert({
            where: { slug: tag.slug },
            update: {
              label: tag.label,
            },
            create: {
              slug: tag.slug,
              label: tag.label,
            },
          });

          tagIdsBySlug.set(tag.slug, record.id);
        })
      );

      await tx.forumPostTagOverride.deleteMany({
        where: { postId: id },
      });

      if (overrideRows.length > 0) {
        await tx.forumPostTagOverride.createMany({
          data: overrideRows.map(({ action, tag }) => ({
            postId: id,
            tagId: tagIdsBySlug.get(tag.slug)!,
            action,
          })),
          skipDuplicates: true,
        });
      }

      await rebuildForumPostTags(tx, {
        postId: id,
        automaticTags: autoTags,
        overrideRows,
      });
    });

    const postWithTags = await prisma.forumPost.findUnique({
      where: { id },
      select: {
        tags: {
          select: {
            source: true,
            tag: {
                select: {
                  slug: true,
                  label: true,
                },
              },
            },
        },
      },
    });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: {
          ...post,
          tags: buildForumPostTagPayloads(postWithTags?.tags ?? []),
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
