import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { hashSessionToken, hashUserPassword } from "@/lib/user-auth";
import {
  createUserFixture,
  createSecurityEventFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteRequest } from "@/test/request-helpers";
import { GET as getAuthMe } from "./me/route";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { POST as signup } from "./signup/route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type AuthWorkflowPrismaMock = {
  user?: {
    findUnique: AsyncMethod;
    create: AsyncMethod;
  };
  userSession?: {
    create: AsyncMethod;
    findUnique: AsyncMethod;
    deleteMany: AsyncMethod;
  };
  securityEvent?: {
    create: AsyncMethod;
  };
  rateLimitCounter?: {
    deleteMany: AsyncMethod;
    upsert: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as AuthWorkflowPrismaMock;
const originalUserFindUnique = prismaClient.user?.findUnique;
const originalUserCreate = prismaClient.user?.create;
const originalUserSessionCreate = prismaClient.userSession?.create;
const originalUserSessionFindUnique = prismaClient.userSession?.findUnique;
const originalUserSessionDeleteMany = prismaClient.userSession?.deleteMany;
const originalSecurityEventCreate = prismaClient.securityEvent?.create;
const originalRateLimitCounter = prismaClient.rateLimitCounter;

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
  };
});

afterEach(async () => {
  await resetRateLimitStore();
  if (prismaClient.user && originalUserFindUnique) {
    prismaClient.user.findUnique = originalUserFindUnique;
  }
  if (prismaClient.user && originalUserCreate) {
    prismaClient.user.create = originalUserCreate;
  }
  if (prismaClient.userSession && originalUserSessionCreate) {
    prismaClient.userSession.create = originalUserSessionCreate;
  }
  if (prismaClient.userSession && originalUserSessionFindUnique) {
    prismaClient.userSession.findUnique = originalUserSessionFindUnique;
  }
  if (prismaClient.userSession && originalUserSessionDeleteMany) {
    prismaClient.userSession.deleteMany = originalUserSessionDeleteMany;
  }
  if (prismaClient.securityEvent && originalSecurityEventCreate) {
    prismaClient.securityEvent.create = originalSecurityEventCreate;
  }
  prismaClient.rateLimitCounter = originalRateLimitCounter;
});

test("signup creates a user session and returns the new user", async () => {
  prismaClient.user = {
    findUnique: async () => null,
    create: async ({ data }: { data: { email: string; name: string } }) =>
      createUserFixture({
        id: "user-1",
        email: data.email,
        name: data.name,
      }),
  };
  prismaClient.userSession = {
    create: async () => createUserSessionFixture(),
    findUnique: async () => null,
    deleteMany: async () => ({ count: 0 }),
  };

  const response = await signup(
    createRouteRequest("http://localhost/api/auth/signup", {
      method: "POST",
      headers: {
        origin: "http://localhost",
      },
      json: {
        email: "owner@example.com",
        password: "CorrectHorseBatteryStaple",
        name: "Owner",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.email, "owner@example.com");
  assert.match(response.headers.get("set-cookie") ?? "", /evory_user_session=/);
});

test("login returns a session cookie for a valid password", async () => {
  prismaClient.user = {
    findUnique: async () =>
      createUserFixture({
        id: "user-1",
        email: "owner@example.com",
        passwordHash: hashUserPassword("CorrectHorseBatteryStaple"),
      }),
    create: async () => createUserFixture(),
  };
  prismaClient.userSession = {
    create: async () => createUserSessionFixture(),
    findUnique: async () => null,
    deleteMany: async () => ({ count: 0 }),
  };

  const response = await login(
    createRouteRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        origin: "http://localhost",
      },
      json: {
        email: "owner@example.com",
        password: "CorrectHorseBatteryStaple",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.email, "owner@example.com");
  assert.match(response.headers.get("set-cookie") ?? "", /evory_user_session=/);
  assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /Secure/);
});

test("login hardens the session cookie when https is forwarded by a proxy", async () => {
  prismaClient.user = {
    findUnique: async () =>
      createUserFixture({
        id: "user-1",
        email: "owner@example.com",
        passwordHash: hashUserPassword("CorrectHorseBatteryStaple"),
      }),
    create: async () => createUserFixture(),
  };
  prismaClient.userSession = {
    create: async () => createUserSessionFixture(),
    findUnique: async () => null,
    deleteMany: async () => ({ count: 0 }),
  };

  const response = await login(
    createRouteRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "x-forwarded-proto": "https",
      },
      json: {
        email: "owner@example.com",
        password: "CorrectHorseBatteryStaple",
      },
    })
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /Secure/);
});

test("me returns the current user when the session cookie is valid", async () => {
  const token = "valid-session-token";

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

  const response = await getAuthMe(
    createRouteRequest("http://localhost/api/auth/me", {
      headers: {
        cookie: `evory_user_session=${token}`,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.email, "owner@example.com");
});

test("logout clears the session cookie", async () => {
  const token = "active-session-token";

  prismaClient.userSession = {
    create: async () => createUserSessionFixture(),
    findUnique: async () =>
      createUserSessionFixture({
        tokenHash: hashSessionToken(token),
      }),
    deleteMany: async () => ({ count: 1 }),
  };

  const response = await logout(
    createRouteRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${token}`,
        origin: "http://localhost",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /Secure/);
});

test("logout hardens the cleared cookie when https is forwarded by a proxy", async () => {
  const token = "active-session-token";

  prismaClient.userSession = {
    create: async () => createUserSessionFixture(),
    findUnique: async () =>
      createUserSessionFixture({
        tokenHash: hashSessionToken(token),
      }),
    deleteMany: async () => ({ count: 1 }),
  };

  const response = await logout(
    createRouteRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${token}`,
        origin: "http://localhost",
        "x-forwarded-proto": "https",
      },
    })
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /Secure/);
});

test("signup rate limits repeated attempts from the same ip", async () => {
  prismaClient.user = {
    findUnique: async () => null,
    create: async ({ data }: { data: { email: string; name: string } }) =>
      createUserFixture({
        id: "signup-user",
        email: data.email,
        name: data.name,
      }),
  };
  prismaClient.userSession = {
    create: async () => createUserSessionFixture(),
    findUnique: async () => null,
    deleteMany: async () => ({ count: 0 }),
  };

  let response: Response | null = null;
  for (let index = 0; index < 4; index += 1) {
    response = await signup(
      createRouteRequest("http://localhost/api/auth/signup", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "x-forwarded-for": "198.51.100.55",
        },
        json: {
          email: `owner-${index}@example.com`,
          password: "CorrectHorseBatteryStaple",
          name: "Owner",
        },
      })
    );
  }

  const json = await response?.json();
  assert.equal(response?.status, 429);
  assert.equal(json?.retryAfterSeconds > 0, true);
});

test("login records an auth failure event for invalid credentials", async () => {
  let createdEvent: Record<string, unknown> | null = null;

  prismaClient.user = {
    findUnique: async () =>
      createUserFixture({
        id: "user-1",
        email: "owner@example.com",
        passwordHash: hashUserPassword("CorrectHorseBatteryStaple"),
      }),
    create: async () => createUserFixture(),
  };
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdEvent = data;
      return createSecurityEventFixture({
        ...data,
      });
    },
  };

  const response = await login(
    createRouteRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "x-forwarded-for": "198.51.100.61",
      },
      json: {
        email: "owner@example.com",
        password: "wrong-password",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.error, "Invalid email or password");
  assert.deepEqual(createdEvent, {
    type: "AUTH_FAILURE",
    routeKey: "auth-login",
    ipAddress: "198.51.100.61",
    userId: null,
    metadata: {
      scope: "user",
      severity: "warning",
      operation: "user_login",
      summary: "User login attempt failed.",
      reason: "invalid-credentials",
      email: "owner@example.com",
    },
  });
});

test("login rate limits repeated attempts from the same ip", async () => {
  prismaClient.user = {
    findUnique: async () =>
      createUserFixture({
        id: "user-1",
        email: "owner@example.com",
        passwordHash: hashUserPassword("CorrectHorseBatteryStaple"),
      }),
    create: async () => createUserFixture(),
  };

  let response: Response | null = null;
  for (let index = 0; index < 6; index += 1) {
    response = await login(
      createRouteRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "x-forwarded-for": "198.51.100.62",
        },
        json: {
          email: "owner@example.com",
          password: "wrong-password",
        },
      })
    );
  }

  const json = await response?.json();
  assert.equal(response?.status, 429);
  assert.equal(json?.retryAfterSeconds > 0, true);
});

test("logout rejects cross-origin requests", async () => {
  const token = "active-session-token";

  prismaClient.userSession = {
    create: async () => createUserSessionFixture(),
    findUnique: async () =>
      createUserSessionFixture({
        tokenHash: hashSessionToken(token),
      }),
    deleteMany: async () => ({ count: 1 }),
  };

  const response = await logout(
    createRouteRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${token}`,
        origin: "https://evil.example",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.error, "Invalid request origin");
});
