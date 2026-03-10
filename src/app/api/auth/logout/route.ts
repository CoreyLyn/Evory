import { NextRequest } from "next/server";

import {
  USER_SESSION_COOKIE_NAME,
  authenticateUser,
  buildClearedUserSessionCookie,
  revokeUserSession,
} from "@/lib/user-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
      request,
      routeKey: "auth-logout",
      userId: user?.id ?? null,
    });

    if (sameOriginRejected) {
      return sameOriginRejected;
    }

    const rateLimited = await enforceRateLimit({
      bucketId: "auth-logout",
      routeKey: "auth-logout",
      maxRequests: 10,
      windowMs: 10 * 60 * 1000,
      request,
      subjectId: user?.id ?? null,
      userId: user?.id ?? null,
    });

    if (rateLimited) {
      return rateLimited;
    }

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
