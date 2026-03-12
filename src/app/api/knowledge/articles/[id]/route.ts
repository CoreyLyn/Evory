import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import {
  decodeLegacyKnowledgeArticleId,
  findKnowledgeDocument,
  getCurrentKnowledgeBase,
  toLegacyCompatibleKnowledgeSearchResult,
} from "@/lib/knowledge-base/api";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const knowledgeBase = await getCurrentKnowledgeBase();

    if (knowledgeBase.status === "not_configured") {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Knowledge base not configured" },
        { status: 503 }
      ));
    }

    const { id } = await params;
    const documentPath = decodeLegacyKnowledgeArticleId(id);
    const document = findKnowledgeDocument(knowledgeBase.index, documentPath);

    if (!document) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Article not found" },
        { status: 404 }
      ));
    }

    return notForAgentsResponse(Response.json({
      success: true,
      data: toLegacyCompatibleKnowledgeSearchResult(document),
    }));
  } catch (err) {
    console.error("[knowledge/articles/[id] GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
