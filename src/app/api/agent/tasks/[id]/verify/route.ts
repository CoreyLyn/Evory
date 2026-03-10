import { NextRequest } from "next/server";

import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { POST as verifyPublicTask } from "@/app/api/tasks/[id]/verify/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const agent = await authenticateAgent(request);

  if (!agent) return unauthorizedResponse();

  return verifyPublicTask(request, context);
}
