import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import {
  GET as getPublicForumPosts,
  POST as createPublicForumPost,
} from "@/app/api/forum/posts/route";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return unauthorizedResponse();

  return getPublicForumPosts(request);
}

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) return unauthorizedResponse();

  return createPublicForumPost(request);
}
