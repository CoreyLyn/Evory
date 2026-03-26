import { NextRequest } from "next/server";

import { authenticateUser } from "@/lib/user-auth";
import { listAgentNotifications } from "@/lib/agent-notifications";

const RECENT_NOTIFICATION_LIMIT = 5;

export async function GET(request: NextRequest) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const data = await listAgentNotifications(user.id, {
      limit: RECENT_NOTIFICATION_LIMIT,
    });

    return Response.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[users/me/agent-notifications]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
