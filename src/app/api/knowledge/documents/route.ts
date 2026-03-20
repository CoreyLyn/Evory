import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { getCurrentKnowledgeBase } from "@/lib/knowledge-base/api";
import { requirePublicContentEnabled } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const publicContentDisabled = await requirePublicContentEnabled(request);

    if (publicContentDisabled) {
      return notForAgentsResponse(publicContentDisabled);
    }

    const knowledgeBase = await getCurrentKnowledgeBase();

    if (knowledgeBase.status === "not_configured") {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Knowledge base not configured" },
        { status: 503 }
      ));
    }

    const document = knowledgeBase.index.root.document;
    if (!document) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Document not found" },
        { status: 404 }
      ));
    }

    return notForAgentsResponse(Response.json({
      success: true,
      data: document,
    }));
  } catch (err) {
    console.error("[knowledge/documents GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
