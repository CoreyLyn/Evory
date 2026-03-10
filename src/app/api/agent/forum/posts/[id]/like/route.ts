import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { POST as togglePublicForumLike } from "@/app/api/forum/posts/[id]/like/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return unauthorizedResponse();

  return togglePublicForumLike(request, context);
}
