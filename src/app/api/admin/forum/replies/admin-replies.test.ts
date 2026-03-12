import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createForumReplyFixture,
  createSecurityEventFixture,
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";
import { POST as hideReply } from "./[id]/hide/route";
import { POST as restoreReply } from "./[id]/restore/route";

const prismaClient = prisma as Record<string, any>;

const originalMethods = {
  userSession: prismaClient.userSession,
  forumReply: prismaClient.forumReply,
  securityEvent: prismaClient.securityEvent,
  rateLimitCounter: prismaClient.rateLimitCounter,
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
});

afterEach(async () => {
  await resetRateLimitStore();
  prismaClient.userSession = originalMethods.userSession;
  prismaClient.forumReply = originalMethods.forumReply;
  prismaClient.securityEvent = originalMethods.securityEvent;
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
});

// ---------------------------------------------------------------------------
// POST /api/admin/forum/replies/[id]/hide
// ---------------------------------------------------------------------------

test("POST hide reply — returns 401 when no session", async () => {
  mockNoSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/reply-1/hide",
    { method: "POST", headers: { origin: "http://localhost" } }
  );
  const response = await hideReply(request, createRouteParams({ id: "reply-1" }));

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Unauthorized");
});

test("POST hide reply — returns 403 when user role is not ADMIN", async () => {
  mockNonAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/reply-1/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${USER_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await hideReply(request, createRouteParams({ id: "reply-1" }));

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Forbidden: Admin access required");
});

test("POST hide reply — returns 404 for missing reply", async () => {
  mockAdminSession();

  prismaClient.forumReply = {
    ...prismaClient.forumReply,
    findUnique: async () => null,
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/nonexistent/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await hideReply(
    request,
    createRouteParams({ id: "nonexistent" })
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Reply not found");
});

test("POST hide reply — returns 400 if reply already hidden", async () => {
  mockAdminSession();

  prismaClient.forumReply = {
    ...prismaClient.forumReply,
    findUnique: async () =>
      createForumReplyFixture({
        id: "reply-1",
        postId: "post-1",
        hiddenAt: new Date().toISOString(),
        hiddenById: "admin-1",
      }),
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/reply-1/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await hideReply(request, createRouteParams({ id: "reply-1" }));

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Reply is already hidden");
});

test("POST hide reply — successfully hides reply and returns updated reply", async () => {
  mockAdminSession();

  const originalReply = createForumReplyFixture({
    id: "reply-1",
    postId: "post-1",
    hiddenAt: null,
    hiddenById: null,
  });
  const updatedReply = {
    ...originalReply,
    hiddenAt: new Date().toISOString(),
    hiddenById: "admin-1",
  };

  prismaClient.forumReply = {
    ...prismaClient.forumReply,
    findUnique: async () => originalReply,
    update: async () => updatedReply,
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/reply-1/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await hideReply(request, createRouteParams({ id: "reply-1" }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.notEqual(body.data.hiddenAt, null);
  assert.equal(body.data.hiddenById, "admin-1");
});

test("POST hide reply — creates CONTENT_HIDDEN SecurityEvent", async () => {
  mockAdminSession();

  const originalReply = createForumReplyFixture({
    id: "reply-1",
    postId: "post-1",
    hiddenAt: null,
    hiddenById: null,
  });

  let capturedEvent: Record<string, any> | null = null;

  prismaClient.forumReply = {
    ...prismaClient.forumReply,
    findUnique: async () => originalReply,
    update: async () => ({
      ...originalReply,
      hiddenAt: new Date().toISOString(),
      hiddenById: "admin-1",
    }),
  };
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, any> }) => {
      capturedEvent = data;
      return createSecurityEventFixture();
    },
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/reply-1/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  await hideReply(request, createRouteParams({ id: "reply-1" }));

  assert.ok(capturedEvent, "SecurityEvent should have been created");
  assert.equal(capturedEvent!.type, "CONTENT_HIDDEN");
  assert.equal(capturedEvent!.routeKey, "admin-forum-hide-reply");
  assert.equal(capturedEvent!.userId, "admin-1");
  assert.equal((capturedEvent!.metadata as any).replyId, "reply-1");
  assert.equal((capturedEvent!.metadata as any).postId, "post-1");
});

// ---------------------------------------------------------------------------
// POST /api/admin/forum/replies/[id]/restore
// ---------------------------------------------------------------------------

test("POST restore reply — returns 404 for missing reply", async () => {
  mockAdminSession();

  prismaClient.forumReply = {
    ...prismaClient.forumReply,
    findUnique: async () => null,
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/nonexistent/restore",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await restoreReply(
    request,
    createRouteParams({ id: "nonexistent" })
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Reply not found");
});

test("POST restore reply — returns 400 if reply is not hidden", async () => {
  mockAdminSession();

  prismaClient.forumReply = {
    ...prismaClient.forumReply,
    findUnique: async () =>
      createForumReplyFixture({ id: "reply-1", postId: "post-1", hiddenAt: null }),
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/reply-1/restore",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await restoreReply(
    request,
    createRouteParams({ id: "reply-1" })
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Reply is not hidden");
});

test("POST restore reply — successfully restores reply and returns updated reply", async () => {
  mockAdminSession();

  const hiddenReply = createForumReplyFixture({
    id: "reply-1",
    postId: "post-1",
    hiddenAt: new Date().toISOString(),
    hiddenById: "admin-1",
  });
  const restoredReply = {
    ...hiddenReply,
    hiddenAt: null,
    hiddenById: null,
  };

  prismaClient.forumReply = {
    ...prismaClient.forumReply,
    findUnique: async () => hiddenReply,
    update: async () => restoredReply,
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/reply-1/restore",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  const response = await restoreReply(
    request,
    createRouteParams({ id: "reply-1" })
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.hiddenAt, null);
  assert.equal(body.data.hiddenById, null);
});

test("POST restore reply — creates CONTENT_RESTORED SecurityEvent", async () => {
  mockAdminSession();

  const hiddenReply = createForumReplyFixture({
    id: "reply-1",
    postId: "post-1",
    hiddenAt: new Date().toISOString(),
    hiddenById: "admin-1",
  });

  let capturedEvent: Record<string, any> | null = null;

  prismaClient.forumReply = {
    ...prismaClient.forumReply,
    findUnique: async () => hiddenReply,
    update: async () => ({
      ...hiddenReply,
      hiddenAt: null,
      hiddenById: null,
    }),
  };
  prismaClient.securityEvent = {
    create: async ({ data }: { data: Record<string, any> }) => {
      capturedEvent = data;
      return createSecurityEventFixture();
    },
  };

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/reply-1/restore",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }
  );
  await restoreReply(request, createRouteParams({ id: "reply-1" }));

  assert.ok(capturedEvent, "SecurityEvent should have been created");
  assert.equal(capturedEvent!.type, "CONTENT_RESTORED");
  assert.equal(capturedEvent!.routeKey, "admin-forum-restore-reply");
  assert.equal(capturedEvent!.userId, "admin-1");
  assert.equal((capturedEvent!.metadata as any).replyId, "reply-1");
  assert.equal((capturedEvent!.metadata as any).postId, "post-1");
});

// ---------------------------------------------------------------------------
// CSRF — Hide and Restore
// ---------------------------------------------------------------------------

test("POST hide reply — returns 403 when origin header is missing", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/reply-1/hide",
    {
      method: "POST",
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    }
  );
  const response = await hideReply(request, createRouteParams({ id: "reply-1" }));

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Invalid request origin");
});

test("POST hide reply — returns 403 when origin is cross-origin", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/reply-1/hide",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://evil.example.com",
      },
    }
  );
  const response = await hideReply(request, createRouteParams({ id: "reply-1" }));

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Invalid request origin");
});

test("POST restore reply — returns 403 when origin header is missing", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/reply-1/restore",
    {
      method: "POST",
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    }
  );
  const response = await restoreReply(
    request,
    createRouteParams({ id: "reply-1" })
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Invalid request origin");
});

test("POST restore reply — returns 403 when origin is cross-origin", async () => {
  mockAdminSession();

  const request = createRouteRequest(
    "http://localhost/api/admin/forum/replies/reply-1/restore",
    {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://evil.example.com",
      },
    }
  );
  const response = await restoreReply(
    request,
    createRouteParams({ id: "reply-1" })
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Invalid request origin");
});
