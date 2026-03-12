import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { GET as getPublicKnowledgeDocumentByPath } from "@/app/api/knowledge/documents/[...slug]/route";

type RouteContext = {
  params: Promise<{
    slug?: string | string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  return officialAgentResponse(await getPublicKnowledgeDocumentByPath(request, context));
}
