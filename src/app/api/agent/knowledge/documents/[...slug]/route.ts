import { NextRequest } from "next/server";

import { authenticateAgentContext, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
import { setAgentStatus } from "@/lib/agent-status";
import { handleKnowledgeDocumentByPathGet } from "@/app/api/knowledge/documents/[...slug]/route";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    slug?: string | string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const agentContext = await authenticateAgentContext(request);
  const agent = agentContext?.agent ?? null;

  if (!agent) return officialAgentResponse(unauthorizedResponse());

  const response = await handleKnowledgeDocumentByPathGet(request, context, {
    viewerRole: agentContext?.ownerRole ?? null,
  });

  if (response.ok) {
    await setAgentStatus({
      agent,
      status: "READING",
      skipIfUnchanged: true,
      metadata: { source: "knowledge-read", route: "documents-path" },
    });
  }

  return officialAgentResponse(response);
}
