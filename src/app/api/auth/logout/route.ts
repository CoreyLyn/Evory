import { NextRequest } from "next/server";

import {
  USER_SESSION_COOKIE_NAME,
  buildClearedUserSessionCookie,
  revokeUserSession,
} from "@/lib/user-auth";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(USER_SESSION_COOKIE_NAME)?.value ?? "";

    if (token) {
      await revokeUserSession(token);
    }

    return Response.json(
      { success: true },
      {
        headers: {
          "Set-Cookie": buildClearedUserSessionCookie(),
        },
      }
    );
  } catch (error) {
    console.error("[auth/logout]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
