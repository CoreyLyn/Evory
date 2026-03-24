import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createForumPostFixture,
  createForumPostTagFixture,
  createSecurityEventFixture,
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";
import { GET as listPosts } from "./route";
import { POST as hidePost } from "./[id]/hide/route";
import { PUT as updateFeaturedOverride } from "./[id]/featured/route";
import { POST as restorePost } from "./[id]/restore/route";
import { PUT as replacePostTags } from "./[id]/tags/route";
import { POST as deletePost } from "./[id]/delete/route";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type SecurityEventData = {
  type?: string;
  routeKey?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
} & Record<string, unknown>;

type AdminPostPrismaMock = {
  userSession: {
    findUnique: AsyncMethod;
    deleteMany: AsyncMethod<[], { count: number }>;
  };
  agent: {
    update: AsyncMethod;
  };
  forumPost: {
    findMany: AsyncMethod;
    findUnique: AsyncMethod;
    update: AsyncMethod;
    delete: AsyncMethod;
    count: AsyncMethod;
  };
  pointTransaction: {
    findFirst: AsyncMethod;
    create: AsyncMethod;
  };
  agentActivity?: {
    create: AsyncMethod;
  };
  forumTag?: {
    upsert: AsyncMethod;
  };
  forumPostTag?: {
    deleteMany: AsyncMethod;
    createMany: AsyncMethod;
  };
  forumPostTagOverride?: {
    deleteMany: AsyncMethod;
    createMany: AsyncMethod;
  };
  securityEvent: {
    create: AsyncMethod<[{
      data: SecurityEventData;
    }], unknown>;
  };
  rateLimitCounter: unknown;
  $transaction: (input: unknown) => Promise<unknown>;
};

const prismaClient = prisma as unknown as AdminPostPrismaMock;

const originalMethods = {
  userSession: prismaClient.userSession,
  agent: prismaClient.agent,
  forumPost: prismaClient.forumPost,
  pointTransaction: prismaClient.pointTransaction,
  agentActivity: prismaClient.agentActivity,
  forumTag: prismaClient.forumTag,
  forumPostTag: prismaClient.forumPostTag,
  forumPostTagOverride: prismaClient.forumPostTagOverride,
  securityEvent: prismaClient.securityEvent,
  rateLimitCounter: prismaClient.rateLimitCounter,
  transaction: prismaClient.$transaction,
};

const ADMIN_TOKEN = "admin-session-token";
const USER_TOKEN = "user-session-token";

function mockAdminSession() {
  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(ADMIN_TOKEN)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({ role: "ADMIN", id: "admin-1" }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
}

function mockNonAdminSession() {
  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(USER_TOKEN)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({ role: "USER" }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
}

function mockNoSession() {
  prismaClient.userSession = {
    findUnique: async () => null,
    deleteMany: async () => ({ count: 0 }),
  };
}

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
  };
  prismaClient.agent = {
    update: async () => ({ id: "agent-1" }),
  };
  prismaClient.pointTransaction = {
    findFirst: async () => null,
    create: async ({ data }: { data: unknown }) => data,
  };
  prismaClient.agentActivity = {
    create: async () => ({ id: "activity-1" }),
  };
  prismaClient.forumTag = {
    upsert: async ({ where }: { where: { slug: string } }) => ({
      id: `tag-${where.slug}`,
      slug: where.slug,
      label: where.slug.toUpperCase(),
      kind: "CORE",
    }),
  };
  prismaClient.forumPostTag = {
    deleteMany: async () => ({ count: 0 }),
    createMany: async () => ({ count: 0 }),
  };
  prismaClient.forumPostTagOverride = {
    deleteMany: async () => ({ count: 0 }),
    createMany: async () => ({ count: 0 }),
  };
  prismaClient.$transaction = async (input: unknown) => {
    if (typeof input === "function") {
      return input({
        agent: prismaClient.agent,
        forumPost: prismaClient.forumPost,
        pointTransaction: prismaClient.pointTransaction,
        agentActivity: prismaClient.agentActivity,
        forumTag: prismaClient.forumTag,
        forumPostTag: prismaClient.forumPostTag,
        forumPostTagOverride: prismaClient.forumPostTagOverride,
        securityEvent: prismaClient.securityEvent,
      });
    }

    return input;
  };
});

afterEach(async () => {
  await resetRateLimitStore();
  prismaClient.userSession = originalMethods.userSession;
  prismaClient.agent = originalMethods.agent;
  prismaClient.forumPost = originalMethods.forumPost;
  prismaClient.pointTransaction = originalMethods.pointTransaction;
  prismaClient.agentActivity = originalMethods.agentActivity;
  prismaClient.forumTag = originalMethods.forumTag;
  prismaClient.forumPostTag = originalMethods.forumPostTag;
  prismaClient.forumPostTagOverride = originalMethods.forumPostTagOverride;
  prismaClient.securityEvent = originalMethods.securityEvent;
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  prismaClient.$transaction = originalMethods.transaction;
});

// ---------------------------------------------------------------------------
// GET /api/admin/forum/posts
// ---------------------------------------------------------------------------

test("GET list posts — returns 401 when no session", async () => {
  mockNoSession();

  const request = createRouteRequest("http://localhost/api/admin/forum/posts");
  const response = await listPosts(request);

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Unauthorized");
});

test("GET list posts — returns 403 when user role is not ADMIN", async () => {
  mockNonAdminSession();

  const request = createRouteRequest("http://localhost/api/admin/forum/posts", {
    headers: { cookie: `evory_user_session=${USER_TOKEN}` },
  });
  const response = await listPosts(request);

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Forbidden: Admin access required");
});

test("GET list posts — returns posts including hidden ones when no status filter", async () => {
  mockAdminSession();

  const visiblePost = createForumPostFixture({ id: "post-1", hiddenAt: null });
  const hiddenPost = createForumPostFixture({
    id: "post-2",
    hiddenAt: new Date().toISOString(),
    hiddenById: "admin-1",
  });

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findMany: async () => [visiblePost, hiddenPost],
    count: async () => 2,
  };

  const request = createRouteRequest("http://localhost/api/admin/forum/posts", {
    headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
  });
  const response = await listPosts(request);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.length, 2);
  assert.equal(body.pagination.total, 2);
  assert.equal(body.data[0].replyCount, 0);
  assert.equal(body.data[0].featuredOverride, null);
});

test("GET list posts — returns tags on admin forum posts", async () => {
  mockAdminSession();

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findMany: async () => [
      createForumPostFixture({
        tags: [
          createForumPostTagFixture({
            tag: { id: "tag-1", slug: "api", label: "API", kind: "CORE" },
          }),
        ],
      }),
    ],
    count: async () => 1,
  };

  const request = createRouteRequest("http://localhost/api/admin/forum/posts", {
    headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
  });
  const response = await listPosts(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.data[0].tags, [
    { slug: "api", label: "API", kind: "core", source: "auto" },
  ]);
});

test("GET list posts — includes featuredOverride on admin forum posts", async () => {
  mockAdminSession();

  let capturedFindManyArgs: Record<string, unknown> | null = null;
  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findMany: async (args: Record<string, unknown>) => {
      capturedFindManyArgs = args;
      return [
      createForumPostFixture({
        featuredOverride: true,
      }),
      ];
    },
    count: async () => 1,
  };

  const request = createRouteRequest("http://localhost/api/admin/forum/posts", {
    headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
  });
  const response = await listPosts(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(
    (capturedFindManyArgs?.select as Record<string, unknown> | undefined)
      ?.featuredOverride,
    true
  );
  assert.equal(body.data[0].featuredOverride, true);
});

test("GET list posts — returns only hidden posts when status=hidden", async () => {
  mockAdminSession();

  const hiddenPost = createForumPostFixture({
    id: "post-2",
    hiddenAt: new Date().toISOString(),
    hiddenById: "admin-1",
  });

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findMany: async () => [hiddenPost],
    count: async () => 1,
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts?status=hidden",
    { headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` } }
  );
  const response = await listPosts(request);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.length, 1);
  assert.equal(body.pagination.total, 1);
  assert.notEqual(body.data[0].hiddenAt, null);
});

// ---------------------------------------------------------------------------
// POST /api/admin/forum/posts/[id]/hide
// ---------------------------------------------------------------------------

test("POST hide — returns 401 when no session", async () => {
  mockNoSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/hide",
    { method: "POST", headers: { origin: "http://localhost" } }
  );
  const response = await hidePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Unauthorized");
});

test("POST hide — returns 403 when user role is not ADMIN", async () => {
  mockNonAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${USER_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await hidePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Forbidden: Admin access required");
});

test("POST hide — returns 404 for missing post", async () => {
  mockAdminSession();

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => null,
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/nonexistent/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await hidePost(
    request,
    createRouteParams({ id: "nonexistent" })
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Post not found");
});

test("POST hide — returns 400 if post already hidden", async () => {
  mockAdminSession();

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () =>
      createForumPostFixture({
        id: "post-1",
        hiddenAt: new Date().toISOString(),
        hiddenById: "admin-1",
      }),
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await hidePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Post is already hidden");
});

test("POST hide — successfully hides post and returns updated post", async () => {
  mockAdminSession();

  const originalPost = createForumPostFixture({
    id: "post-1",
    hiddenAt: null,
    hiddenById: null,
  });
  const updatedPost = {
    ...originalPost,
    hiddenAt: new Date().toISOString(),
    hiddenById: "admin-1",
  };

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => originalPost,
    update: async () => updatedPost,
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await hidePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.notEqual(body.data.hiddenAt, null);
  assert.equal(body.data.hiddenById, "admin-1");
});

test("POST hide — creates CONTENT_HIDDEN SecurityEvent", async () => {
  mockAdminSession();

  const originalPost = createForumPostFixture({
    id: "post-1",
    hiddenAt: null,
    hiddenById: null,
  });

  let capturedEvent: SecurityEventData | null = null;

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => originalPost,
    update: async () => ({
      ...originalPost,
      hiddenAt: new Date().toISOString(),
      hiddenById: "admin-1",
    }),
  };
  prismaClient.securityEvent = {
    create: async ({ data }: { data: SecurityEventData }) => {
      capturedEvent = data;
      return createSecurityEventFixture();
    },
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  await hidePost(request, createRouteParams({ id: "post-1" }));

  assert.ok(capturedEvent, "SecurityEvent should have been created");
  assert.equal(capturedEvent!.type, "CONTENT_HIDDEN");
  assert.equal(capturedEvent!.routeKey, "admin-forum-hide");
  assert.equal(capturedEvent!.userId, "admin-1");
  assert.equal(
    (capturedEvent!.metadata as Record<string, unknown>).postId,
    "post-1"
  );
});

test("POST hide — deducts the original CREATE_POST points once", async () => {
  mockAdminSession();

  const originalPost = createForumPostFixture({
    id: "post-1",
    agentId: "agent-1",
    hiddenAt: null,
    hiddenById: null,
  });
  const pointTransactions: Array<Record<string, unknown>> = [];

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => originalPost,
    update: async () => ({
      ...originalPost,
      hiddenAt: new Date().toISOString(),
      hiddenById: "admin-1",
    }),
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

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await hidePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 200);
  assert.equal(pointTransactions.length, 1);
  assert.equal(pointTransactions[0]?.amount, -5);
  assert.equal(pointTransactions[0]?.type, "CREATE_POST");
  assert.equal(pointTransactions[0]?.referenceId, "create-post-reversal:post-1");
});

// ---------------------------------------------------------------------------
// POST /api/admin/forum/posts/[id]/restore
// ---------------------------------------------------------------------------

test("POST restore — returns 404 for missing post", async () => {
  mockAdminSession();

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => null,
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/nonexistent/restore",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await restorePost(
    request,
    createRouteParams({ id: "nonexistent" })
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Post not found");
});

test("POST restore — returns 400 if post is not hidden", async () => {
  mockAdminSession();

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () =>
      createForumPostFixture({ id: "post-1", hiddenAt: null }),
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/restore",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await restorePost(
    request,
    createRouteParams({ id: "post-1" })
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Post is not hidden");
});

test("POST restore — successfully restores post and returns updated post", async () => {
  mockAdminSession();

  const hiddenPost = createForumPostFixture({
    id: "post-1",
    hiddenAt: new Date().toISOString(),
    hiddenById: "admin-1",
  });
  const restoredPost = {
    ...hiddenPost,
    hiddenAt: null,
    hiddenById: null,
  };

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => hiddenPost,
    update: async () => restoredPost,
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/restore",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await restorePost(
    request,
    createRouteParams({ id: "post-1" })
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.hiddenAt, null);
  assert.equal(body.data.hiddenById, null);
});

test("POST restore — creates CONTENT_RESTORED SecurityEvent", async () => {
  mockAdminSession();

  const hiddenPost = createForumPostFixture({
    id: "post-1",
    hiddenAt: new Date().toISOString(),
    hiddenById: "admin-1",
  });

  let capturedEvent: SecurityEventData | null = null;

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => hiddenPost,
    update: async () => ({
      ...hiddenPost,
      hiddenAt: null,
      hiddenById: null,
    }),
  };
  prismaClient.securityEvent = {
    create: async ({ data }: { data: SecurityEventData }) => {
      capturedEvent = data;
      return createSecurityEventFixture();
    },
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/restore",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  await restorePost(request, createRouteParams({ id: "post-1" }));

  assert.ok(capturedEvent, "SecurityEvent should have been created");
  assert.equal(capturedEvent!.type, "CONTENT_RESTORED");
  assert.equal(capturedEvent!.routeKey, "admin-forum-restore");
  assert.equal(capturedEvent!.userId, "admin-1");
  assert.equal(
    (capturedEvent!.metadata as Record<string, unknown>).postId,
    "post-1"
  );
});

// ---------------------------------------------------------------------------
// CSRF — Hide and Restore
// ---------------------------------------------------------------------------

test("POST hide — returns 403 when origin header is missing", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/hide",
    {
      method: "POST",
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    }
  );
  const response = await hidePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Invalid request origin");
});

test("POST hide — returns 403 when origin is cross-origin", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://evil.example.com",
      },
    }
  );
  const response = await hidePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Invalid request origin");
});

test("POST restore — returns 403 when origin header is missing", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/restore",
    {
      method: "POST",
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    }
  );
  const response = await restorePost(
    request,
    createRouteParams({ id: "post-1" })
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Invalid request origin");
});

test("POST restore — returns 403 when origin is cross-origin", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/restore",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://evil.example.com",
      },
    }
  );
  const response = await restorePost(
    request,
    createRouteParams({ id: "post-1" })
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Invalid request origin");
});

// ---------------------------------------------------------------------------
// PUT /api/admin/forum/posts/[id]/featured
// ---------------------------------------------------------------------------

test("PUT featured — returns 401 when no session", async () => {
  mockNoSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/featured",
    {
      method: "PUT",
      headers: { origin: "http://localhost" },
      json: { featuredOverride: true },
    }
  );
  const response = await updateFeaturedOverride(
    request,
    createRouteParams({ id: "post-1" })
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Unauthorized");
});

test("PUT featured — returns 403 when user role is not ADMIN", async () => {
  mockNonAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/featured",
    {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${USER_TOKEN}`,
        origin: "http://localhost",
      },
      json: { featuredOverride: true },
    }
  );
  const response = await updateFeaturedOverride(
    request,
    createRouteParams({ id: "post-1" })
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Forbidden: Admin access required");
});

test("PUT featured — returns 400 for invalid payload", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/featured",
    {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: { featuredOverride: "yes" },
    }
  );
  const response = await updateFeaturedOverride(
    request,
    createRouteParams({ id: "post-1" })
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "featuredOverride must be true, false, or null");
});

test("PUT featured — returns 404 for missing post", async () => {
  mockAdminSession();

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => null,
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/nonexistent/featured",
    {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: { featuredOverride: true },
    }
  );
  const response = await updateFeaturedOverride(
    request,
    createRouteParams({ id: "nonexistent" })
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Post not found");
});

test("PUT featured — successfully updates featured override and returns it", async () => {
  mockAdminSession();

  const originalPost = createForumPostFixture({
    id: "post-1",
    featuredOverride: null,
  });
  let capturedUpdateArgs:
    | { where: { id: string }; data: { featuredOverride: boolean | null } }
    | null = null;

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => originalPost,
    update: async (args: {
      where: { id: string };
      data: { featuredOverride: boolean | null };
    }) => {
      capturedUpdateArgs = args;
      return {
        ...originalPost,
        ...args.data,
      };
    },
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/featured",
    {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        featuredOverride: true,
      },
    }
  );
  const response = await updateFeaturedOverride(
    request,
    createRouteParams({ id: "post-1" })
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.data, {
    id: "post-1",
    featuredOverride: true,
  });
  assert.deepEqual(capturedUpdateArgs, {
    where: { id: "post-1" },
    data: { featuredOverride: true },
  });
});

test("PUT featured — returns 403 when origin header is missing", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/featured",
    {
      method: "PUT",
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
      json: { featuredOverride: true },
    }
  );
  const response = await updateFeaturedOverride(
    request,
    createRouteParams({ id: "post-1" })
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Invalid request origin");
});

test("PUT featured — returns 403 when origin is cross-origin", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/featured",
    {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://evil.example.com",
      },
      json: { featuredOverride: true },
    }
  );
  const response = await updateFeaturedOverride(
    request,
    createRouteParams({ id: "post-1" })
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Invalid request origin");
});

// ---------------------------------------------------------------------------
// PUT /api/admin/forum/posts/[id]/tags
// ---------------------------------------------------------------------------

test("PUT tags rebuilds overrides and final tags from admin textarea", async () => {
  mockAdminSession();

  const operationOrder: string[] = [];
  const findUniqueCalls: Array<Record<string, unknown>> = [];
  const tagUpsertCalls: Array<Record<string, unknown>> = [];
  const overrideDeleteCalls: Array<Record<string, unknown>> = [];
  const overrideCreateManyCalls: Array<Record<string, unknown>> = [];
  const finalTagDeleteCalls: Array<Record<string, unknown>> = [];
  const finalTagCreateManyCalls: Array<Record<string, unknown>> = [];
  const materializedTagRows = [
    createForumPostTagFixture({
      id: "post-tag-api",
      source: "MANUAL",
      tag: { id: "tag-api", slug: "api", label: "API", kind: "CORE" },
    }),
    createForumPostTagFixture({
      id: "post-tag-performance",
      source: "MANUAL",
      tag: {
        id: "tag-performance",
        slug: "performance",
        label: "Performance",
        kind: "CORE",
      },
    }),
  ];

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async (args: Record<string, unknown>) => {
      findUniqueCalls.push(args);

      if (findUniqueCalls.length === 1) {
        return createForumPostFixture({
          id: "post-1",
          title: "Backend API",
          content: "Server service handles HTTP endpoints.",
          category: "technical",
        });
      }

      return createForumPostFixture({
        id: "post-1",
        title: "Backend API",
        content: "Server service handles HTTP endpoints.",
        category: "technical",
        tags: materializedTagRows,
      });
    },
  };
  prismaClient.forumTag = {
    upsert: async (args: Record<string, unknown>) => {
      tagUpsertCalls.push(args);
      return {
        id: `tag-${(args.where as { slug: string }).slug}`,
      };
    },
  };
  prismaClient.forumPostTagOverride = {
    deleteMany: async (args: Record<string, unknown>) => {
      operationOrder.push("overrideDelete");
      overrideDeleteCalls.push(args);
      return { count: 1 };
    },
    createMany: async (args: Record<string, unknown>) => {
      operationOrder.push("overrideCreate");
      overrideCreateManyCalls.push(args);
      return { count: 3 };
    },
  };
  prismaClient.forumPostTag = {
    deleteMany: async (args: Record<string, unknown>) => {
      operationOrder.push("finalDelete");
      finalTagDeleteCalls.push(args);
      return { count: 1 };
    },
    createMany: async (args: Record<string, unknown>) => {
      operationOrder.push("finalCreate");
      finalTagCreateManyCalls.push(args);
      return { count: 2 };
    },
  };

  const response = await replacePostTags(
    createRouteRequest("http://localhost/api/admin/forum/posts/post-1/tags", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        tags: [
          { slug: "api", label: "API", kind: "core" },
          { slug: "performance", label: "Performance", kind: "core" },
        ],
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(findUniqueCalls.length, 2);
  assert.deepEqual(findUniqueCalls[1], {
    where: { id: "post-1" },
    select: {
      tags: {
        select: {
          source: true,
          tag: {
            select: {
              slug: true,
              label: true,
              kind: true,
            },
          },
        },
      },
    },
  });
  assert.deepEqual(operationOrder, [
    "overrideDelete",
    "overrideCreate",
    "finalDelete",
    "finalCreate",
  ]);
  assert.deepEqual(overrideDeleteCalls, [{ where: { postId: "post-1" } }]);
  assert.equal(overrideCreateManyCalls.length, 1);
  assert.deepEqual(
    [
      ...((overrideCreateManyCalls[0].data as Array<Record<string, string>>) ?? []),
    ]
      .map(({ action, postId, tagId }) => ({ action, postId, tagId }))
      .sort((left, right) => left.action.localeCompare(right.action)),
    [
      { action: "ADD", postId: "post-1", tagId: "tag-performance" },
      { action: "LOCK", postId: "post-1", tagId: "tag-api" },
      { action: "REMOVE", postId: "post-1", tagId: "tag-backend" },
    ]
  );
  assert.deepEqual(finalTagDeleteCalls, [{ where: { postId: "post-1" } }]);
  assert.equal(finalTagCreateManyCalls.length, 1);
  assert.deepEqual(
    (finalTagCreateManyCalls[0].data as Array<Record<string, string>>).map(
      ({ postId, tagId, source }) => ({ postId, tagId, source })
    ),
    [
      { postId: "post-1", tagId: "tag-api", source: "MANUAL" },
      { postId: "post-1", tagId: "tag-performance", source: "MANUAL" },
    ]
  );
  assert.deepEqual(
    [...new Set(
      tagUpsertCalls.map((call) => (call.where as { slug: string }).slug)
    )].sort(),
    ["api", "backend", "performance"]
  );
  assert.deepEqual(body.data.tags, [
    { slug: "api", label: "API", kind: "core", source: "manual" },
    {
      slug: "performance",
      label: "Performance",
      kind: "core",
      source: "manual",
    },
  ]);
});

// ---------------------------------------------------------------------------
// POST /api/admin/forum/posts/[id]/delete
// ---------------------------------------------------------------------------

test("POST delete — returns 401 when no session", async () => {
  mockNoSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/delete",
    { method: "POST", headers: { origin: "http://localhost" } }
  );
  const response = await deletePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Unauthorized");
});

test("POST delete — returns 403 when user role is not ADMIN", async () => {
  mockNonAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/delete",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${USER_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await deletePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Forbidden: Admin access required");
});

test("POST delete — returns 404 for missing post", async () => {
  mockAdminSession();

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => null,
    delete: async () => ({}),
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/nonexistent/delete",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await deletePost(
    request,
    createRouteParams({ id: "nonexistent" })
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Post not found");
});

test("POST delete — permanently deletes post and returns deletedId", async () => {
  mockAdminSession();

  const post = createForumPostFixture({ id: "post-1", agentId: "agent-1" });
  let deleteCalled = false;

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => post,
    delete: async () => {
      deleteCalled = true;
      return post;
    },
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/delete",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await deletePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.deletedId, "post-1");
  assert.ok(deleteCalled, "prisma.forumPost.delete should have been called");
});

test("POST delete — creates CONTENT_DELETED SecurityEvent", async () => {
  mockAdminSession();

  const post = createForumPostFixture({ id: "post-1", agentId: "agent-1" });
  let capturedEvent: SecurityEventData | null = null;

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => post,
    delete: async () => post,
  };
  prismaClient.securityEvent = {
    create: async ({ data }: { data: SecurityEventData }) => {
      capturedEvent = data;
      return createSecurityEventFixture();
    },
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/delete",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  await deletePost(request, createRouteParams({ id: "post-1" }));

  assert.ok(capturedEvent, "SecurityEvent should have been created");
  assert.equal(capturedEvent!.type, "CONTENT_DELETED");
  assert.equal(capturedEvent!.routeKey, "admin-forum-delete");
  assert.equal(capturedEvent!.userId, "admin-1");
  assert.equal(
    (capturedEvent!.metadata as Record<string, unknown>).postId,
    "post-1"
  );
});

test("POST delete — does not deduct CREATE_POST points twice after a prior hide deduction", async () => {
  mockAdminSession();

  const post = createForumPostFixture({ id: "post-1", agentId: "agent-1" });
  let pointTransactionCreates = 0;

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => post,
    delete: async () => post,
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

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/delete",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await deletePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 200);
  assert.equal(pointTransactionCreates, 0);
});

test("POST delete — returns 403 when origin header is missing", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/posts/post-1/delete",
    {
      method: "POST",
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    }
  );
  const response = await deletePost(request, createRouteParams({ id: "post-1" }));

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Invalid request origin");
});
