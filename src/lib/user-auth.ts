import { NextRequest } from "next/server";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import prisma from "./prisma";

export const USER_SESSION_COOKIE_NAME = "evory_user_session";

const USER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthenticatedUser = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
};

type UserSessionRecord = {
  expiresAt: Date | string;
  user?: AuthenticatedUser | null;
};

type UserAuthPrismaClient = {
  userSession?: {
    create: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<UserSessionRecord | null>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
};

const userAuthPrisma = prisma as unknown as UserAuthPrismaClient;

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashUserPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derivedKey}`;
}

export function verifyUserPassword(password: string, passwordHash: string) {
  const [algorithm, salt, expectedHash] = passwordHash.split(":");

  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(
    Buffer.from(actualHash, "hex"),
    Buffer.from(expectedHash, "hex")
  );
}

function shouldUseSecureSessionCookie(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }

  return request.nextUrl.protocol === "https:";
}

export function buildUserSessionCookie(
  request: NextRequest,
  token: string,
  expiresAt: Date
) {
  const parts = [
    `${USER_SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (shouldUseSecureSessionCookie(request)) {
    parts.push("Secure");
    parts.push("Priority=High");
  }

  return parts.join("; ");
}

export function buildClearedUserSessionCookie(request: NextRequest) {
  const parts = [
    `${USER_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (shouldUseSecureSessionCookie(request)) {
    parts.push("Secure");
    parts.push("Priority=High");
  }

  return parts.join("; ");
}

export async function createUserSession(userId: string) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + USER_SESSION_TTL_MS);

  await userAuthPrisma.userSession?.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function revokeUserSession(token: string) {
  if (!token) return;

  await userAuthPrisma.userSession?.deleteMany({
    where: {
      tokenHash: hashSessionToken(token),
    },
  });
}

export async function authenticateUserSessionToken(
  token: string | null | undefined,
  prismaClient: UserAuthPrismaClient = userAuthPrisma
): Promise<AuthenticatedUser | null> {
  if (!token) return null;

  const session = await prismaClient.userSession?.findUnique({
    where: {
      tokenHash: hashSessionToken(token),
    },
    include: {
      user: true,
    },
  });

  if (!session?.user) return null;

  const expiresAt = new Date(session.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    await prismaClient.userSession?.deleteMany({
      where: {
        tokenHash: hashSessionToken(token),
      },
    });
    return null;
  }

  return session.user;
}

export async function authenticateUser(
  request: NextRequest,
  prismaClient: UserAuthPrismaClient = userAuthPrisma
): Promise<AuthenticatedUser | null> {
  const token = request.cookies.get(USER_SESSION_COOKIE_NAME)?.value;

  return authenticateUserSessionToken(token, prismaClient);
}
