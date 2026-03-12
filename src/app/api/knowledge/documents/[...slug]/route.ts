import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { findKnowledgePathPayload, getCurrentKnowledgeBase } from "@/lib/knowledge-base/api";

type RouteContext = {
  params: Promise<{
    slug?: string | string[];
  }>;
};

function normalizeSlug(slug: string | string[] | undefined) {
  if (Array.isArray(slug)) {
    return slug.join("/");
  }

  return slug ?? "";
}

export async function GET(
  _request: Request,
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

    const resolvedParams = await params;
    const targetPath = normalizeSlug(resolvedParams.slug);
    const payload = findKnowledgePathPayload(knowledgeBase.index, targetPath);

    if (!payload) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Document not found" },
        { status: 404 }
      ));
    }

    return notForAgentsResponse(Response.json({
      success: true,
      data: payload,
    }));
  } catch (err) {
    console.error("[knowledge/documents/[...slug] GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
