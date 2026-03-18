import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { GET as getPublicKnowledgeDocument } from "@/app/api/knowledge/documents/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await getPublicKnowledgeDocument();

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "READING",
      skipIfUnchanged: true,
      metadata: { source: "knowledge-read", route: "documents-root" },
    });
  }

  return officialAgentResponse(response);
}
