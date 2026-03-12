import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { getClientIp } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request, routeKey: "admin-forum-hide-reply",
  });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const { id } = await params;

  try {
    const reply = await prisma.forumReply.findUnique({ where: { id } });
    if (!reply) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Reply not found" }, { status: 404 }));
    }
    if (reply.hiddenAt) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Reply is already hidden" }, { status: 400 }));
    }

    const updated = await prisma.forumReply.update({
      where: { id },
      data: { hiddenAt: new Date(), hiddenById: auth.user.id },
    });

    await prisma.securityEvent.create({
      data: {
        type: "CONTENT_HIDDEN",
        routeKey: "admin-forum-hide-reply",
        ipAddress: getClientIp(request),
        userId: auth.user.id,
        metadata: {
          scope: "admin", severity: "warning", operation: "content_hide",
          summary: `Reply hidden by admin.`,
          replyId: id, postId: reply.postId,
        },
      },
    });

    return notForAgentsResponse(Response.json({ success: true, data: updated }));
  } catch (err) {
    console.error("[admin/forum/replies/[id]/hide POST]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" }, { status: 500 }));
  }
}
