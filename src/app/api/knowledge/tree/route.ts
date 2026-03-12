import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { getCurrentKnowledgeBase } from "@/lib/knowledge-base/api";

export async function GET() {
  try {
    const knowledgeBase = await getCurrentKnowledgeBase();

    if (knowledgeBase.status === "not_configured") {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Knowledge base not configured" },
        { status: 503 }
      ));
    }

    return notForAgentsResponse(Response.json({
      success: true,
      data: knowledgeBase.index.root,
    }));
  } catch (err) {
    console.error("[knowledge/tree GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
