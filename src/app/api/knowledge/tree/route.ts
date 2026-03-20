import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import {
  countKnowledgeDocuments,
  findKnowledgeDirectoryViewModel,
  getCurrentKnowledgeBase,
} from "@/lib/knowledge-base/api";
import { requirePublicContentEnabledForViewer } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  options?: { viewerRole?: string | null }
) {
  try {
    const publicContentDisabled = await requirePublicContentEnabledForViewer({
      request,
      viewerRole: options?.viewerRole,
    });

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

    const { searchParams } = new URL(request.url);
    const targetPath = searchParams.get("path")?.trim() ?? "";
    const directory = findKnowledgeDirectoryViewModel(knowledgeBase.index, targetPath);

    if (!directory) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Directory not found" },
        { status: 404 }
      ));
    }

    return notForAgentsResponse(Response.json({
      success: true,
      data: directory,
      meta: {
        totalDocuments: countKnowledgeDocuments(knowledgeBase.index),
      },
    }));
  } catch (err) {
    console.error("[knowledge/tree GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
