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
  forumPost: {
    findMany: AsyncMethod;
    findUnique: AsyncMethod;
    update: AsyncMethod;
    count: AsyncMethod;
  };
  forumTag?: {
    upsert: AsyncMethod;
  };
  forumPostTag?: {
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
  forumPost: prismaClient.forumPost,
  forumTag: prismaClient.forumTag,
  forumPostTag: prismaClient.forumPostTag,
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
  prismaClient.$transaction = async (input: unknown) => {
    if (typeof input === "function") {
      return input({
        forumPost: prismaClient.forumPost,
        forumTag: prismaClient.forumTag,
        forumPostTag: prismaClient.forumPostTag,
        securityEvent: prismaClient.securityEvent,
      });
    }

    return input;
  };
});

afterEach(async () => {
  await resetRateLimitStore();
  prismaClient.userSession = originalMethods.userSession;
  prismaClient.forumPost = originalMethods.forumPost;
  prismaClient.forumTag = originalMethods.forumTag;
  prismaClient.forumPostTag = originalMethods.forumPostTag;
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
    hiddenReason: "ADMIN",
  };
  let capturedUpdateArgs: Record<string, unknown> | null = null;

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () => originalPost,
    update: async (args: unknown) => {
      capturedUpdateArgs = args as Record<string, unknown>;
      return updatedPost;
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
  const body = await response.json();
  assert.equal(body.success, true);
  assert.notEqual(body.data.hiddenAt, null);
  assert.equal(body.data.hiddenById, "admin-1");
  assert.equal(body.data.hiddenReason, "ADMIN");
  assert.ok(
    (capturedUpdateArgs?.data as Record<string, unknown> | undefined)?.hiddenAt instanceof Date
  );
  assert.equal(
    (capturedUpdateArgs?.data as Record<string, unknown> | undefined)?.hiddenById,
    "admin-1"
  );
  assert.equal(
    (capturedUpdateArgs?.data as Record<string, unknown> | undefined)?.hiddenReason,
    "ADMIN"
  );
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

test("PUT tags replaces a post's final tag set with manual tags", async () => {
  mockAdminSession();

  const deleteCalls: Array<Record<string, unknown>> = [];
  const createManyCalls: Array<Record<string, unknown>> = [];

  prismaClient.forumPost = {
    ...prismaClient.forumPost,
    findUnique: async () =>
      createForumPostFixture({
        id: "post-1",
        tags: [
          createForumPostTagFixture({
            tag: { id: "tag-api", slug: "api", label: "API", kind: "CORE" },
          }),
        ],
      }),
  };
  prismaClient.forumPostTag = {
    deleteMany: async (args: Record<string, unknown>) => {
      deleteCalls.push(args);
      return { count: 1 };
    },
    createMany: async (args: Record<string, unknown>) => {
      createManyCalls.push(args);
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
          { slug: "ci-cd", label: "CI / CD", kind: "freeform" },
        ],
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(deleteCalls.length, 1);
  assert.equal(createManyCalls.length, 1);
  assert.deepEqual(body.data.tags, [
    { slug: "api", label: "API", kind: "core", source: "manual" },
    { slug: "ci-cd", label: "CI / CD", kind: "freeform", source: "manual" },
  ]);
});
