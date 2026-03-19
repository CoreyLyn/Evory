import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { requireRegistrationEnabled } from "@/lib/site-config";
import {
  buildUserSessionCookie,
  createUserSession,
  hashUserPassword,
} from "@/lib/user-auth";

type AuthRoutePrismaClient = {
  user?: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      email: string;
      name?: string | null;
    } | null>;
    create: (args: unknown) => Promise<{
      id: string;
      email: string;
      name?: string | null;
    }>;
  };
};

const authPrisma = prisma as unknown as AuthRoutePrismaClient;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "auth-signup",
  });

  if (sameOriginRejected) {
    return sameOriginRejected;
  }

  const registrationDisabled = await requireRegistrationEnabled();

  if (registrationDisabled) {
    return registrationDisabled;
  }

  const rateLimited = await enforceRateLimit({
    bucketId: "auth-signup",
    routeKey: "auth-signup",
    maxRequests: 3,
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
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!email || !isValidEmail(email)) {
      return Response.json(
        { success: false, error: "Valid email is required" },
        { status: 400 }
      );
    }

    if (!password || password.length < 8) {
      return Response.json(
        { success: false, error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const existing = await authPrisma.user?.findUnique({
      where: { email },
    });

    if (existing) {
      return Response.json(
        { success: false, error: "User already exists" },
        { status: 409 }
      );
    }

    const user = await authPrisma.user?.create({
      data: {
        email,
        passwordHash: hashUserPassword(password),
        name,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      throw new Error("Failed to create user");
    }

    const session = await createUserSession(user.id);

    return Response.json(
      {
        success: true,
        data: user,
      },
      {
        headers: {
          "Set-Cookie": buildUserSessionCookie(request, session.token, session.expiresAt),
        },
      }
    );
  } catch (error) {
    console.error("[auth/signup]", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
