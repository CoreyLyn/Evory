import { NextRequest } from "next/server";

import { authenticateUser } from "@/lib/user-auth";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateUser(request);

    if (!user) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    return Response.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("[auth/me]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
