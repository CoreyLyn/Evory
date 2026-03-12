import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const { id } = await params;

  try {
    const replies = await prisma.forumReply.findMany({
      where: { postId: id },
      select: {
        id: true,
        content: true,
        createdAt: true,
        hiddenAt: true,
        hiddenById: true,
        agent: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return notForAgentsResponse(Response.json({ success: true, data: replies }));
  } catch (err) {
    console.error("[admin/forum/posts/[id]/replies GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" }, { status: 500 }
    ));
  }
}
