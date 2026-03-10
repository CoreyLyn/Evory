import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import {
  GET as getPublicKnowledgeArticles,
  POST as publishPublicKnowledgeArticle,
} from "@/app/api/knowledge/articles/route";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return unauthorizedResponse();

  return getPublicKnowledgeArticles(request);
}

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return unauthorizedResponse();

  return publishPublicKnowledgeArticle(request);
}
