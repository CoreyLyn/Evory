import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest } from "@/test/request-helpers";
import {
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import {
  USER_SESSION_COOKIE_NAME,
  authenticateUser,
  buildClearedUserSessionCookie,
  buildUserSessionCookie,
  createUserSession,
  hashSessionToken,
  hashUserPassword,
  verifyUserPassword,
} from "./user-auth";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type UserAuthPrismaMock = {
  userSession?: {
    create: AsyncMethod;
    findUnique: AsyncMethod;
    deleteMany: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as UserAuthPrismaMock;
const originalUserSessionCreate = prismaClient.userSession?.create;
const originalUserSessionFindUnique = prismaClient.userSession?.findUnique;
const originalUserSessionDeleteMany = prismaClient.userSession?.deleteMany;

afterEach(() => {
  if (prismaClient.userSession && originalUserSessionCreate) {
    prismaClient.userSession.create = originalUserSessionCreate;
  }
  if (prismaClient.userSession && originalUserSessionFindUnique) {
    prismaClient.userSession.findUnique = originalUserSessionFindUnique;
  }
  if (prismaClient.userSession && originalUserSessionDeleteMany) {
    prismaClient.userSession.deleteMany = originalUserSessionDeleteMany;
  }
});

test("hashUserPassword and verifyUserPassword round-trip", () => {
  const password = "CorrectHorseBatteryStaple";
  const passwordHash = hashUserPassword(password);

  assert.equal(verifyUserPassword(password, passwordHash), true);
  assert.equal(verifyUserPassword("wrong-password", passwordHash), false);
});

test("createUserSession stores a hashed token and returns the raw token", async () => {
  let storedTokenHash = "";

  prismaClient.userSession = {
    create: async ({
      data,
    }: {
      data: { tokenHash: string };
    }) => {
      storedTokenHash = data.tokenHash;
      return createUserSessionFixture();
    },
    findUnique: async () => null,
    deleteMany: async () => ({ count: 0 }),
  };

  const session = await createUserSession("user-1");

  assert.match(session.token, /^[A-Za-z0-9_-]{20,}$/);
  assert.equal(storedTokenHash, hashSessionToken(session.token));
  assert.ok(session.expiresAt instanceof Date);
});

test("authenticateUser returns the session user when the cookie token is valid", async () => {
  const token = "session-token";

  prismaClient.userSession = {
    create: async () => createUserSessionFixture(),
    findUnique: async ({
      where,
    }: {
      where: { tokenHash: string };
    }) =>
      where.tokenHash === hashSessionToken(token)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({
              id: "user-1",
              email: "owner@example.com",
            }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };

  const user = await authenticateUser(
    createRouteRequest("http://localhost/api/auth/me", {
      headers: {
        cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
      },
    })
  );

  assert.equal(user?.id, "user-1");
  assert.equal(user?.email, "owner@example.com");
});

test("authenticateUser ignores expired sessions", async () => {
  const token = "expired-session-token";

  prismaClient.userSession = {
    create: async () => createUserSessionFixture(),
    findUnique: async () =>
      createUserSessionFixture({
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    deleteMany: async () => ({ count: 1 }),
  };

  const user = await authenticateUser(
    createRouteRequest("http://localhost/api/auth/me", {
      headers: {
        cookie: `${USER_SESSION_COOKIE_NAME}=${token}`,
      },
    })
  );

  assert.equal(user, null);
});

test("buildUserSessionCookie and buildClearedUserSessionCookie format session cookies", () => {
  const expiresAt = new Date("2026-04-01T00:00:00.000Z");
  const setCookie = buildUserSessionCookie("token-1", expiresAt);
  const clearCookie = buildClearedUserSessionCookie();

  assert.match(setCookie, new RegExp(`^${USER_SESSION_COOKIE_NAME}=token-1;`));
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Path=\//);
  assert.match(setCookie, /Expires=/);

  assert.match(clearCookie, new RegExp(`^${USER_SESSION_COOKIE_NAME}=;`));
  assert.match(clearCookie, /Max-Age=0/);
});

test("session cookies are hardened in production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const expiresAt = new Date("2026-04-01T00:00:00.000Z");
    const setCookie = buildUserSessionCookie("token-1", expiresAt);
    const clearCookie = buildClearedUserSessionCookie();

    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /Priority=High/);
    assert.match(clearCookie, /Secure/);
    assert.match(clearCookie, /Priority=High/);
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
});
