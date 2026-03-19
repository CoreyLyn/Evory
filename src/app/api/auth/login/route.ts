import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import {
  buildUserSessionCookie,
  createUserSession,
  verifyUserPassword,
} from "@/lib/user-auth";

type LoginRoutePrismaClient = {
  user?: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      email: string;
      name?: string | null;
      passwordHash: string;
    } | null>;
  };
  securityEvent?: {
    create: (args: unknown) => Promise<unknown>;
  };
};

const loginPrisma = prisma as unknown as LoginRoutePrismaClient;

export async function POST(request: NextRequest) {
  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "auth-login",
  });

  if (sameOriginRejected) {
    return sameOriginRejected;
  }

  const rateLimited = await enforceRateLimit({
    bucketId: "auth-login",
    routeKey: "auth-login",
    maxRequests: 5,
    windowMs: 10 * 60 * 1000,
    request,
  });

  if (rateLimited) {
    return rateLimited;
  }

  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return Response.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await loginPrisma.user?.findUnique({
      where: { email },
    });

    if (!user || !verifyUserPassword(password, user.passwordHash)) {
      await loginPrisma.securityEvent?.create({
        data: {
          type: "AUTH_FAILURE",
          routeKey: "auth-login",
          ipAddress: getClientIp(request),
          userId: null,
          metadata: {
            scope: "user",
            severity: "warning",
            operation: "user_login",
            summary: "User login attempt failed.",
            reason: "invalid-credentials",
            email,
          },
        },
      });

      return Response.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const session = await createUserSession(user.id);

    return Response.json(
      {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name ?? "",
        },
      },
      {
        headers: {
          "Set-Cookie": buildUserSessionCookie(request, session.token, session.expiresAt),
        },
      }
    );
  } catch (error) {
    console.error("[auth/login]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
