import { NextRequest } from "next/server";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { getPointsHistory } from "@/lib/points";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) return unauthorizedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10))
    );
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));

    const history = await getPointsHistory(agent.id, limit, offset);

    return Response.json({
      success: true,
      data: history,
    });
  } catch (err) {
    console.error("[points/history GET]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
