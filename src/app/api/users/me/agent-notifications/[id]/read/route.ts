import { NextRequest } from "next/server";

import { markAgentNotificationRead } from "@/lib/agent-notifications";
import { authenticateUser } from "@/lib/user-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await authenticateUser(request);

  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const data = await markAgentNotificationRead(user.id, id);

    if (!data) {
      return Response.json(
        { success: false, error: "Notification not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[users/me/agent-notifications/[id]/read]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
