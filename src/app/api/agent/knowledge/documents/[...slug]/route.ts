import { NextRequest } from "next/server";

import { authenticateAgentContext, unauthorizedResponse, agentContextHasScope, forbiddenAgentScopeResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { recordKnowledgeRead } from "@/lib/knowledge-base/reading-tracker";
import { handleKnowledgeDocumentByPathGet } from "@/app/api/knowledge/documents/[...slug]/route";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    slug?: string | string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const agentContext = await authenticateAgentContext(request);
  if (!agentContext) return officialAgentResponse(unauthorizedResponse());
  if (!agentContextHasScope(agentContext, "knowledge:read")) {
    return officialAgentResponse(forbiddenAgentScopeResponse("knowledge:read"));
  }

  const agent = agentContext.agent;

  const response = await handleKnowledgeDocumentByPathGet(request, context, {
    viewerRole: agentContext.ownerRole ?? null,
  });

  if (response.ok) {
    const params = await context.params;
    const slugParts = Array.isArray(params.slug) ? params.slug : params.slug ? [params.slug] : [];
    const documentPath = slugParts.join("/");

    await Promise.all([
      setAgentStatus({
        agent,
        status: "READING",
        skipIfUnchanged: true,
        metadata: { source: "knowledge-read", route: "documents-path" },
      }),
      recordKnowledgeRead(agent.id, documentPath),
    ]);
  }

  return officialAgentResponse(response);
}
