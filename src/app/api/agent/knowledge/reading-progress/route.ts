import { NextRequest } from "next/server";

import { authenticateAgentContext, unauthorizedResponse, agentContextHasScope, forbiddenAgentScopeResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { getAgentReadingProgress } from "@/lib/knowledge-base/reading-tracker";
import { getCurrentKnowledgeBase, countKnowledgeDocuments } from "@/lib/knowledge-base/api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const agentContext = await authenticateAgentContext(request);
  if (!agentContext) return officialAgentResponse(unauthorizedResponse());
  if (!agentContextHasScope(agentContext, "knowledge:read")) {
    return officialAgentResponse(forbiddenAgentScopeResponse("knowledge:read"));
  }

  const agent = agentContext.agent;
  const reads = await getAgentReadingProgress(agent.id);

  const knowledgeBase = await getCurrentKnowledgeBase();
  const totalDocuments = knowledgeBase.index
    ? countKnowledgeDocuments(knowledgeBase.index)
    : 0;

  return officialAgentResponse(
    Response.json({
      success: true,
      data: {
        totalDocuments,
        readDocuments: reads.length,
        reads: reads.map((r) => ({
          documentPath: r.documentPath,
          readAt: r.readAt.toISOString(),
        })),
      },
    })
  );
}
