import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentFixture,
  createForumPostFixture,
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type UserForumPostActionsPrismaMock = {
  userSession?: {
    findUnique: AsyncMethod;
    deleteMany: AsyncMethod;
  };
  forumPost?: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as UserForumPostActionsPrismaMock;
const originalUserSessionFindUnique = prismaClient.userSession?.findUnique;
const originalUserSessionDeleteMany = prismaClient.userSession?.deleteMany;
const originalForumPostFindUnique = prismaClient.forumPost?.findUnique;
const originalForumPostUpdate = prismaClient.forumPost?.update;

const USER_TOKEN = "owner-session-token";
const USER_ID = "user-1";

function mockAuthenticatedUser() {
  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(USER_TOKEN)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({ id: USER_ID }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
}

beforeEach(() => {
  prismaClient.forumPost = {
    findUnique: async () => null,
    update: async () => ({}),
  };
});

afterEach(() => {
  if (prismaClient.userSession) {
    if (originalUserSessionFindUnique) {
      prismaClient.userSession.findUnique = originalUserSessionFindUnique;
    }
    if (originalUserSessionDeleteMany) {
      prismaClient.userSession.deleteMany = originalUserSessionDeleteMany;
    }
  }

  if (prismaClient.forumPost) {
    if (originalForumPostFindUnique) {
      prismaClient.forumPost.findUnique = originalForumPostFindUnique;
    }
    if (originalForumPostUpdate) {
      prismaClient.forumPost.update = originalForumPostUpdate;
    }
  }
});

async function loadHideHandler() {
  const mod = await import("./hide/route").catch(() => null);
  assert.ok(mod, "expected src/app/api/users/me/forum/posts/[id]/hide/route.ts to exist");
  assert.equal(typeof mod.POST, "function");
  return mod.POST;
}

async function loadRestoreHandler() {
  const mod = await import("./restore/route").catch(() => null);
  assert.ok(mod, "expected src/app/api/users/me/forum/posts/[id]/restore/route.ts to exist");
  assert.equal(typeof mod.POST, "function");
  return mod.POST;
}

test("POST hide returns 401 without auth", async () => {
  const POST = await loadHideHandler();
  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/forum/posts/post-1/hide", {
      method: "POST",
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("POST hide returns 404 when post is not owned by the current user", async () => {
  mockAuthenticatedUser();
  prismaClient.forumPost = {
    findUnique: async () =>
      createForumPostFixture({
        id: "post-1",
        hiddenAt: null,
        agent: createAgentFixture({ ownerUserId: "other-user" }),
      }),
    update: async () => ({}),
  };

  const POST = await loadHideHandler();
  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/forum/posts/post-1/hide", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${USER_TOKEN}`,
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Post not found");
});

test("POST hide writes hiddenAt and hiddenById for an owned visible post", async () => {
  mockAuthenticatedUser();

  let capturedUpdateArgs: Record<string, unknown> | null = null;

  prismaClient.forumPost = {
    findUnique: async () =>
      createForumPostFixture({
        id: "post-1",
        hiddenAt: null,
        agent: createAgentFixture({ ownerUserId: USER_ID }),
      }),
    update: async (args: unknown) => {
      capturedUpdateArgs = args as Record<string, unknown>;
      return createForumPostFixture({
        id: "post-1",
        hiddenAt: new Date().toISOString(),
        hiddenById: USER_ID,
        agent: createAgentFixture({ ownerUserId: USER_ID }),
      });
    },
  };

  const POST = await loadHideHandler();
  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/forum/posts/post-1/hide", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${USER_TOKEN}`,
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.ok(
    (capturedUpdateArgs?.data as Record<string, unknown> | undefined)?.hiddenAt instanceof Date
  );
  assert.equal(
    (capturedUpdateArgs?.data as Record<string, unknown> | undefined)?.hiddenById,
    USER_ID
  );
});

test("POST restore clears hiddenAt and hiddenById for an owned hidden post", async () => {
  mockAuthenticatedUser();

  let capturedUpdateArgs: Record<string, unknown> | null = null;

  prismaClient.forumPost = {
    findUnique: async () =>
      createForumPostFixture({
        id: "post-1",
        hiddenAt: new Date().toISOString(),
        hiddenById: USER_ID,
        agent: createAgentFixture({ ownerUserId: USER_ID }),
      }),
    update: async (args: unknown) => {
      capturedUpdateArgs = args as Record<string, unknown>;
      return createForumPostFixture({
        id: "post-1",
        hiddenAt: null,
        hiddenById: null,
        agent: createAgentFixture({ ownerUserId: USER_ID }),
      });
    },
  };

  const POST = await loadRestoreHandler();
  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/forum/posts/post-1/restore", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${USER_TOKEN}`,
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(capturedUpdateArgs?.data, {
    hiddenAt: null,
    hiddenById: null,
  });
});
