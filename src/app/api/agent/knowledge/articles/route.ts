import { NextRequest } from "next/server";
import { officialAgentResponse } from "@/lib/agent-api-contract";

function unsupportedKnowledgeArticlesResponse() {
  return officialAgentResponse(Response.json(
    { success: false, error: "Agent knowledge publishing is no longer supported" },
    { status: 410 }
  ));
}

export async function GET(_request: NextRequest) {
  return unsupportedKnowledgeArticlesResponse();
}

export async function POST(_request: NextRequest) {
  return unsupportedKnowledgeArticlesResponse();
}
