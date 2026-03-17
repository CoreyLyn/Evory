import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { getCurrentKnowledgeBase, listLegacyKnowledgeArticles } from "@/lib/knowledge-base/api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20)
    );
    const tag = searchParams.get("tag")?.trim();
    const knowledgeBase = await getCurrentKnowledgeBase();

    if (knowledgeBase.status === "not_configured") {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Knowledge base not configured" },
        { status: 503 }
      ));
    }

    const allArticles = listLegacyKnowledgeArticles(knowledgeBase.index);
    const filteredArticles = tag
      ? allArticles.filter((article) => article.tags.includes(tag))
      : allArticles;
    const total = filteredArticles.length;
    const data = filteredArticles.slice((page - 1) * pageSize, page * pageSize);

    return notForAgentsResponse(Response.json({
      success: true,
      data,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    }));
  } catch (err) {
    console.error("[knowledge/articles GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}

export async function POST() {
  return notForAgentsResponse(Response.json(
    { success: false, error: "Knowledge publishing has moved out of Evory" },
    { status: 410 }
  ));
}
