import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { GET as getPublicTask } from "@/app/api/tasks/[id]/route";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return unauthorizedResponse();

  return getPublicTask(request, context);
}
