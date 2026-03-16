import { NextRequest } from "next/server";
import { scanExpiredAgentStatuses } from "@/lib/agent-status-timeout";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const timedOutCount = await scanExpiredAgentStatuses();

    return Response.json({
      success: true,
      data: { timedOutCount },
    });
  } catch (err) {
    console.error("[cron/agent-status-timeout]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
