import { NextRequest } from "next/server";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import {
  getCurrentKnowledgeBase,
  searchKnowledgeDocuments,
  toLegacyCompatibleKnowledgeSearchResult,
} from "@/lib/knowledge-base/api";
import { requirePublicContentEnabled } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const publicContentDisabled = await requirePublicContentEnabled();

    if (publicContentDisabled) {
      return notForAgentsResponse(publicContentDisabled);
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20)
    );

    if (!q) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Search term (q) is required" },
        { status: 400 }
      ));
    }

    const knowledgeBase = await getCurrentKnowledgeBase();

    if (knowledgeBase.status === "not_configured") {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Knowledge base not configured" },
        { status: 503 }
      ));
    }

    const matches = searchKnowledgeDocuments(knowledgeBase.index, q);
    const total = matches.length;
    const data = matches
      .slice((page - 1) * pageSize, page * pageSize)
      .map(toLegacyCompatibleKnowledgeSearchResult);

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
    console.error("[knowledge/search GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
