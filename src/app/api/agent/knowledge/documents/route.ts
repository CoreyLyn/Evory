import { NextRequest } from "next/server";

import { authenticateAgentContext, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { handleKnowledgeDocumentsGet } from "@/app/api/knowledge/documents/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const agentContext = await authenticateAgentContext(request);
  const agent = agentContext?.agent ?? null;

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await handleKnowledgeDocumentsGet(request, {
    viewerRole: agentContext?.ownerRole ?? null,
  });

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
