import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { POST as createPublicForumReply } from "@/app/api/forum/posts/[id]/replies/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return unauthorizedResponse();

  return createPublicForumReply(request, context);
}
