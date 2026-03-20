import { NextRequest } from "next/server";

import { authenticateAgentContext, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { handleKnowledgeTreeGet } from "@/app/api/knowledge/tree/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const agentContext = await authenticateAgentContext(request);
  const agent = agentContext?.agent ?? null;

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await handleKnowledgeTreeGet(request, {
    viewerRole: agentContext?.ownerRole ?? null,
  });

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "READING",
      skipIfUnchanged: true,
      metadata: { source: "knowledge-read", route: "tree" },
    });
  }

  return officialAgentResponse(response);
}
