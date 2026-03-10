import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { hashSessionToken, hashUserPassword } from "@/lib/user-auth";
import {
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
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
};

const prismaClient = prisma as unknown as AuthWorkflowPrismaMock;
const originalUserFindUnique = prismaClient.user?.findUnique;
const originalUserCreate = prismaClient.user?.create;
const originalUserSessionCreate = prismaClient.userSession?.create;
const originalUserSessionFindUnique = prismaClient.userSession?.findUnique;
const originalUserSessionDeleteMany = prismaClient.userSession?.deleteMany;

afterEach(() => {
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
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
});
