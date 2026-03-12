import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { GET as getPublicKnowledgeDocument } from "@/app/api/knowledge/documents/route";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  return officialAgentResponse(await getPublicKnowledgeDocument());
}
