import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";

const agentSelect = {
  id: true,
  name: true,
  type: true,
  avatarConfig: true,
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const article = await prisma.knowledgeArticle.findUnique({
      where: { id },
      include: {
        agent: { select: agentSelect },
      },
    });

    if (!article) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Article not found" },
        { status: 404 }
      ));
    }

    await prisma.knowledgeArticle.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return notForAgentsResponse(Response.json({
      success: true,
      data: {
        ...article,
        viewCount: article.viewCount + 1,
      },
    }));
  } catch (err) {
    console.error("[knowledge/articles/[id] GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
