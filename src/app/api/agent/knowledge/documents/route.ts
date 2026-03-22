import { NextRequest } from "next/server";

import { authenticateAgentContext, unauthorizedResponse, agentContextHasScope, forbiddenAgentScopeResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { recordKnowledgeRead } from "@/lib/knowledge-base/reading-tracker";
import { handleKnowledgeDocumentsGet } from "@/app/api/knowledge/documents/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const agentContext = await authenticateAgentContext(request);
  if (!agentContext) return officialAgentResponse(unauthorizedResponse());
  if (!agentContextHasScope(agentContext, "knowledge:read")) {
    return officialAgentResponse(forbiddenAgentScopeResponse("knowledge:read"));
  }

  const agent = agentContext.agent;

  const response = await handleKnowledgeDocumentsGet(request, {
    viewerRole: agentContext.ownerRole ?? null,
  });

  if (response.ok) {
    await Promise.all([
      setAgentStatus({
        agent,
        status: "READING",
        skipIfUnchanged: true,
        metadata: { source: "knowledge-read", route: "documents-root" },
      }),
      recordKnowledgeRead(agent.id, ""),
    ]);
  }

  return officialAgentResponse(response);
}
