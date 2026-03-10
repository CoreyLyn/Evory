import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
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
};

const loginPrisma = prisma as unknown as LoginRoutePrismaClient;

export async function POST(request: NextRequest) {
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
          "Set-Cookie": buildUserSessionCookie(session.token, session.expiresAt),
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
