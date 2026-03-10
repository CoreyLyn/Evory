import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { GET as getPublicKnowledgeSearch } from "@/app/api/knowledge/search/route";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return unauthorizedResponse();

  return getPublicKnowledgeSearch(request);
}
