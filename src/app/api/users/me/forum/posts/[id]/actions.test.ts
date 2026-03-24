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
  agent?: {
    update: AsyncMethod;
  };
  forumPost?: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
    delete: AsyncMethod;
  };
  pointTransaction?: {
    findFirst: AsyncMethod;
    create: AsyncMethod;
  };
  $transaction?: (input: unknown) => Promise<unknown>;
};

const prismaClient = prisma as unknown as UserForumPostActionsPrismaMock;
const originalUserSessionFindUnique = prismaClient.userSession?.findUnique;
const originalUserSessionDeleteMany = prismaClient.userSession?.deleteMany;
const originalForumPostFindUnique = prismaClient.forumPost?.findUnique;
const originalForumPostUpdate = prismaClient.forumPost?.update;
const originalForumPostDelete = prismaClient.forumPost?.delete;
const originalAgentUpdate = prismaClient.agent?.update;
const originalPointTransactionFindFirst = prismaClient.pointTransaction?.findFirst;
const originalPointTransactionCreate = prismaClient.pointTransaction?.create;
const originalTransaction = prismaClient.$transaction;

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
  prismaClient.agent = {
    update: async () => ({ id: "agent-1" }),
  };
  prismaClient.forumPost = {
    findUnique: async () => null,
    update: async () => ({}),
    delete: async () => ({}),
  };
  prismaClient.pointTransaction = {
    findFirst: async () => null,
    create: async ({ data }: { data: unknown }) => data,
  };
  prismaClient.$transaction = async (input: unknown) => {
    if (typeof input === "function") {
      return input({
        agent: prismaClient.agent,
        forumPost: prismaClient.forumPost,
        pointTransaction: prismaClient.pointTransaction,
      });
    }

    return input;
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
    if (originalForumPostDelete) {
      prismaClient.forumPost.delete = originalForumPostDelete;
    }
  }

  if (prismaClient.agent && originalAgentUpdate) {
    prismaClient.agent.update = originalAgentUpdate;
  }

  if (prismaClient.pointTransaction) {
    if (originalPointTransactionFindFirst) {
      prismaClient.pointTransaction.findFirst = originalPointTransactionFindFirst;
    }
    if (originalPointTransactionCreate) {
      prismaClient.pointTransaction.create = originalPointTransactionCreate;
    }
  }

  if (originalTransaction) {
    prismaClient.$transaction = originalTransaction;
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

async function loadDeleteHandler() {
  const mod = await import("./delete/route").catch(() => null);
  assert.ok(mod, "expected src/app/api/users/me/forum/posts/[id]/delete/route.ts to exist");
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

test("POST hide deducts CREATE_POST points for an owned visible post", async () => {
  mockAuthenticatedUser();

  const pointTransactions: Array<Record<string, unknown>> = [];

  prismaClient.forumPost = {
    findUnique: async () =>
      createForumPostFixture({
        id: "post-1",
        agentId: "agent-1",
        hiddenAt: null,
        agent: createAgentFixture({ ownerUserId: USER_ID }),
      }),
    update: async () =>
      createForumPostFixture({
        id: "post-1",
        agentId: "agent-1",
        hiddenAt: new Date().toISOString(),
        hiddenById: USER_ID,
        agent: createAgentFixture({ ownerUserId: USER_ID }),
      }),
    delete: async () => ({}),
  };
  prismaClient.pointTransaction = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      if (where.referenceId === "post-1") {
        return { id: "txn-create", amount: 5 };
      }

      if (where.referenceId === "create-post-reversal:post-1") {
        return null;
      }

      return null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      pointTransactions.push(data);
      return data;
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

  assert.equal(response.status, 200);
  assert.equal(pointTransactions.length, 1);
  assert.equal(pointTransactions[0]?.amount, -5);
  assert.equal(pointTransactions[0]?.referenceId, "create-post-reversal:post-1");
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

test("POST delete returns 401 without auth", async () => {
  const POST = await loadDeleteHandler();
  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/forum/posts/post-1/delete", {
      method: "POST",
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("POST delete returns 404 when post is not owned by the current user", async () => {
  mockAuthenticatedUser();
  prismaClient.forumPost = {
    findUnique: async () =>
      createForumPostFixture({
        id: "post-1",
        agent: createAgentFixture({ ownerUserId: "other-user" }),
      }),
    update: async () => ({}),
    delete: async () => ({}),
  };

  const POST = await loadDeleteHandler();
  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/forum/posts/post-1/delete", {
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

test("POST delete permanently deletes owned post and returns deletedId", async () => {
  mockAuthenticatedUser();

  let deleteCalled = false;

  prismaClient.forumPost = {
    findUnique: async () =>
      createForumPostFixture({
        id: "post-1",
        agent: createAgentFixture({ ownerUserId: USER_ID }),
      }),
    update: async () => ({}),
    delete: async () => {
      deleteCalled = true;
      return {};
    },
  };

  const POST = await loadDeleteHandler();
  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/forum/posts/post-1/delete", {
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
  assert.equal(json.data.deletedId, "post-1");
  assert.ok(deleteCalled, "prisma.forumPost.delete should have been called");
});

test("POST delete does not deduct CREATE_POST points twice after a prior hide deduction", async () => {
  mockAuthenticatedUser();

  let pointTransactionCreates = 0;

  prismaClient.forumPost = {
    findUnique: async () =>
      createForumPostFixture({
        id: "post-1",
        agentId: "agent-1",
        agent: createAgentFixture({ ownerUserId: USER_ID }),
      }),
    update: async () => ({}),
    delete: async () => ({}),
  };
  prismaClient.pointTransaction = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      if (where.referenceId === "post-1") {
        return { id: "txn-create", amount: 5 };
      }

      if (where.referenceId === "create-post-reversal:post-1") {
        return { id: "txn-reversal", amount: -5 };
      }

      return null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      pointTransactionCreates += 1;
      return data;
    },
  };

  const POST = await loadDeleteHandler();
  const response = await POST(
    createRouteRequest("http://localhost/api/users/me/forum/posts/post-1/delete", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${USER_TOKEN}`,
      },
    }),
    createRouteParams({ id: "post-1" })
  );

  assert.equal(response.status, 200);
  assert.equal(pointTransactionCreates, 0);
});
