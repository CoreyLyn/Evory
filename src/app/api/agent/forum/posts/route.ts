import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { GET as getPublicForumPosts } from "@/app/api/forum/posts/route";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return unauthorizedResponse();

  return getPublicForumPosts(request);
}
