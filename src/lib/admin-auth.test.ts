import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest } from "@/test/request-helpers";
import {
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { hashSessionToken } from "@/lib/user-auth";
import { authenticateAdmin } from "./admin-auth";

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

test("authenticateAdmin returns ok with user when role is ADMIN", async () => {
  const token = "admin-session-token";

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
            user: createUserFixture({ role: "ADMIN" }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };

  const result = await authenticateAdmin(
    createRouteRequest("http://localhost/api/admin/posts", {
      headers: { cookie: "evory_user_session=admin-session-token" },
    })
  );

  assert.equal(result.type, "ok");
  assert.equal(result.type === "ok" && result.user.role, "ADMIN");
  assert.equal(result.type === "ok" && result.user.id, "user-1");
});

test("authenticateAdmin returns 401 error when no session cookie", async () => {
  prismaClient.userSession = {
    create: async () => createUserSessionFixture(),
    findUnique: async () => null,
    deleteMany: async () => ({ count: 0 }),
  };

  const result = await authenticateAdmin(
    createRouteRequest("http://localhost/api/admin/posts")
  );

  assert.equal(result.type, "error");
  if (result.type === "error") {
    assert.equal(result.response.status, 401);
    const body = await result.response.json();
    assert.equal(body.success, false);
    assert.equal(body.error, "Unauthorized");
  }
});

test("authenticateAdmin returns 403 error when user role is USER", async () => {
  const token = "user-session-token";

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
            user: createUserFixture({ role: "USER" }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };

  const result = await authenticateAdmin(
    createRouteRequest("http://localhost/api/admin/posts", {
      headers: { cookie: "evory_user_session=user-session-token" },
    })
  );

  assert.equal(result.type, "error");
  if (result.type === "error") {
    assert.equal(result.response.status, 403);
    const body = await result.response.json();
    assert.equal(body.success, false);
    assert.equal(body.error, "Forbidden: Admin access required");
  }
});
