import { NextRequest } from "next/server";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { getPointsBalance } from "@/lib/points";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) return notForAgentsResponse(unauthorizedResponse());

  try {
    const balance = await getPointsBalance(agent.id);
    return notForAgentsResponse(Response.json({
      success: true,
      data: { balance: balance ?? 0 },
    }));
  } catch (err) {
    console.error("[points/balance GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
