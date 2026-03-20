import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentFixture,
  createForumPostFixture,
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type UserForumPostsPrismaMock = {
  userSession?: {
    findUnique: AsyncMethod;
    deleteMany: AsyncMethod;
  };
  forumPost?: {
    findMany: AsyncMethod;
    count: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as UserForumPostsPrismaMock;
const originalUserSessionFindUnique = prismaClient.userSession?.findUnique;
const originalUserSessionDeleteMany = prismaClient.userSession?.deleteMany;
const originalForumPostFindMany = prismaClient.forumPost?.findMany;
const originalForumPostCount = prismaClient.forumPost?.count;

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
    findMany: async () => [],
    count: async () => 0,
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
    if (originalForumPostFindMany) {
      prismaClient.forumPost.findMany = originalForumPostFindMany;
    }
    if (originalForumPostCount) {
      prismaClient.forumPost.count = originalForumPostCount;
    }
  }
});

async function loadGetHandler() {
  const mod = await import("./route").catch(() => null);
  assert.ok(mod, "expected src/app/api/users/me/forum/posts/route.ts to exist");
  assert.equal(typeof mod.GET, "function");
  return mod.GET;
}

test("GET /api/users/me/forum/posts returns 401 without auth", async () => {
  const GET = await loadGetHandler();
  const response = await GET(
    createRouteRequest("http://localhost/api/users/me/forum/posts")
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("GET /api/users/me/forum/posts lists only the current user's owned-agent posts", async () => {
  mockAuthenticatedUser();

  let capturedWhere: Record<string, unknown> | undefined;

  prismaClient.forumPost = {
    findMany: async (args: Record<string, unknown>) => {
      capturedWhere = args.where as Record<string, unknown>;
      return [
        createForumPostFixture({
          id: "post-1",
          agentId: "agent-1",
          agent: createAgentFixture({ id: "agent-1", ownerUserId: USER_ID, name: "Owner Agent" }),
        }),
      ];
    },
    count: async () => 1,
  };

  const GET = await loadGetHandler();
  const response = await GET(
    createRouteRequest("http://localhost/api/users/me/forum/posts", {
      headers: {
        cookie: `evory_user_session=${USER_TOKEN}`,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.length, 1);
  assert.deepEqual(capturedWhere, {
    agent: {
      ownerUserId: USER_ID,
    },
  });
});

test("GET /api/users/me/forum/posts supports hidden status filtering", async () => {
  mockAuthenticatedUser();

  let capturedWhere: Record<string, unknown> | undefined;

  prismaClient.forumPost = {
    findMany: async (args: Record<string, unknown>) => {
      capturedWhere = args.where as Record<string, unknown>;
      return [];
    },
    count: async () => 0,
  };

  const GET = await loadGetHandler();
  const response = await GET(
    createRouteRequest(
      "http://localhost/api/users/me/forum/posts?status=hidden",
      {
        headers: {
          cookie: `evory_user_session=${USER_TOKEN}`,
        },
      }
    )
  );

  assert.equal(response.status, 200);
  assert.deepEqual(capturedWhere, {
    agent: {
      ownerUserId: USER_ID,
    },
    hiddenAt: { not: null },
  });
});

test("GET /api/users/me/forum/posts supports owned-agent filtering", async () => {
  mockAuthenticatedUser();

  let capturedWhere: Record<string, unknown> | undefined;

  prismaClient.forumPost = {
    findMany: async (args: Record<string, unknown>) => {
      capturedWhere = args.where as Record<string, unknown>;
      return [];
    },
    count: async () => 0,
  };

  const GET = await loadGetHandler();
  const response = await GET(
    createRouteRequest(
      "http://localhost/api/users/me/forum/posts?agentId=agent-owned-1",
      {
        headers: {
          cookie: `evory_user_session=${USER_TOKEN}`,
        },
      }
    )
  );

  assert.equal(response.status, 200);
  assert.deepEqual(capturedWhere, {
    agent: {
      ownerUserId: USER_ID,
    },
    agentId: "agent-owned-1",
  });
});
