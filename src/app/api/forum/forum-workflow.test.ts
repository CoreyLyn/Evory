import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createForumPostFixture,
  createForumPostTagFixture,
  createForumReplyFixture,
  createSecurityEventFixture,
} from "@/test/factories";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { hashApiKey } from "@/lib/auth";
import { GET as getForumPost } from "./posts/[id]/route";
import { POST as createReply } from "./posts/[id]/replies/route";
import { POST as toggleLike } from "./posts/[id]/like/route";
import { POST as createPost } from "./posts/route";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  agentFindUnique: prismaClient.agent.findUnique,
  credentialFindUnique: prismaClient.agentCredential?.findUnique,
  credentialUpdate: prismaClient.agentCredential?.update,
  forumPostFindUnique: prismaClient.forumPost.findUnique,
  forumPostFindMany: prismaClient.forumPost.findMany,
  forumPostUpdate: prismaClient.forumPost.update,
  forumReplyCreate: prismaClient.forumReply.create,
  forumLikeFindUnique: prismaClient.forumLike.findUnique,
  forumLikeCreate: prismaClient.forumLike.create,
  forumLikeDelete: prismaClient.forumLike.delete,
  pointTransactionFindFirst: prismaClient.pointTransaction.findFirst,
  pointTransactionCreate: prismaClient.pointTransaction.create,
  agentUpdate: prismaClient.agent.update,
  dailyCheckinFindUnique: prismaClient.dailyCheckin.findUnique,
  dailyCheckinUpsert: prismaClient.dailyCheckin.upsert,
  dailyCheckinUpdate: prismaClient.dailyCheckin.update,
  securityEventCreate: prismaClient.securityEvent?.create,
  agentActivityCreate: prismaClient.agentActivity?.create,
  forumTag: prismaClient.forumTag,
  forumPostTag: prismaClient.forumPostTag,
  forumPostView: prismaClient.forumPostView,
  rateLimitCounter: prismaClient.rateLimitCounter,
  transaction: prismaClient.$transaction,
};

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
  };
  prismaClient.agentActivity = {
    create: async () => ({ id: "activity-1" }),
  };
  prismaClient.dailyCheckin.findUnique = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      tags: [],
    });
  prismaClient.forumPost.findMany = async () => [];
  prismaClient.forumTag = {
    upsert: async ({ where }: { where: { slug: string } }) => ({
      id: `tag-${where.slug}`,
      slug: where.slug,
      label: where.slug.toUpperCase(),
      kind: "CORE",
    }),
  };
  prismaClient.forumPostTag = {
    createMany: async () => ({ count: 0 }),
  };
  prismaClient.forumPostView = {
    create: async () => ({ id: "view-1" }),
  };
});

afterEach(async () => {
  await resetRateLimitStore();
  prismaClient.agent.findUnique = originalMethods.agentFindUnique;
  if (prismaClient.agentCredential && originalMethods.credentialFindUnique) {
    prismaClient.agentCredential.findUnique = originalMethods.credentialFindUnique;
  }
  if (prismaClient.agentCredential && originalMethods.credentialUpdate) {
    prismaClient.agentCredential.update = originalMethods.credentialUpdate;
  }
  prismaClient.forumPost.findUnique = originalMethods.forumPostFindUnique;
  prismaClient.forumPost.findMany = originalMethods.forumPostFindMany;
  prismaClient.forumPost.update = originalMethods.forumPostUpdate;
  prismaClient.forumReply.create = originalMethods.forumReplyCreate;
  prismaClient.forumLike.findUnique = originalMethods.forumLikeFindUnique;
  prismaClient.forumLike.create = originalMethods.forumLikeCreate;
  prismaClient.forumLike.delete = originalMethods.forumLikeDelete;
  prismaClient.pointTransaction.findFirst = originalMethods.pointTransactionFindFirst;
  prismaClient.pointTransaction.create = originalMethods.pointTransactionCreate;
  prismaClient.agent.update = originalMethods.agentUpdate;
  prismaClient.dailyCheckin.findUnique = originalMethods.dailyCheckinFindUnique;
  prismaClient.dailyCheckin.upsert = originalMethods.dailyCheckinUpsert;
  prismaClient.dailyCheckin.update = originalMethods.dailyCheckinUpdate;
  if (prismaClient.securityEvent && originalMethods.securityEventCreate) {
    prismaClient.securityEvent.create = originalMethods.securityEventCreate;
  }
  if (prismaClient.agentActivity && originalMethods.agentActivityCreate) {
    prismaClient.agentActivity.create = originalMethods.agentActivityCreate;
  }
  prismaClient.forumTag = originalMethods.forumTag;
  prismaClient.forumPostTag = originalMethods.forumPostTag;
  prismaClient.forumPostView = originalMethods.forumPostView;
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  prismaClient.$transaction = originalMethods.transaction;
});

function mockAgentCredential(
  apiKey: string,
  agentOverrides: Record<string, unknown> = {},
  credentialOverrides: Record<string, unknown> = {}
) {
  prismaClient.agent.update = async ({ where }: { where: { id: string } }) =>
    createAgentFixture({
      id: where.id,
      apiKey,
      ...agentOverrides,
    });
  prismaClient.agentCredential = {
    findUnique: async ({ where }: { where: { keyHash: string } }) =>
      where.keyHash === hashApiKey(apiKey)
        ? createAgentCredentialFixture({
            keyHash: where.keyHash,
            ...credentialOverrides,
            agent: createAgentFixture({
              apiKey,
              ...agentOverrides,
            }),
          })
        : null,
    update: async () => createAgentCredentialFixture(),
  };
}

function mockAwardPointsTransaction() {
  prismaClient.dailyCheckin.findUnique = async () => null;
  prismaClient.pointTransaction.findFirst = async () => null;
  prismaClient.pointTransaction.create = async ({ data }: { data: unknown }) => data;
  prismaClient.agent.update = async () => ({ id: "agent-1" });
  prismaClient.dailyCheckin.upsert = async () => ({
    id: "checkin-1",
    actions: {},
  });
  prismaClient.dailyCheckin.update = async () => ({ id: "checkin-1" });
  prismaClient.$transaction = async (input: unknown) => {
    if (typeof input === "function") {
      return input({
        forumLike: {
          create: prismaClient.forumLike.create,
          delete: prismaClient.forumLike.delete,
        },
        forumPost: {
          update: prismaClient.forumPost.update,
        },
        pointTransaction: {
          findFirst: prismaClient.pointTransaction.findFirst,
          create: prismaClient.pointTransaction.create,
        },
        agent: { update: prismaClient.agent.update },
        dailyCheckin: {
          upsert: prismaClient.dailyCheckin.upsert,
          update: prismaClient.dailyCheckin.update,
        },
        agentActivity: {
          create: prismaClient.agentActivity?.create,
        },
      });
    }

    if (Array.isArray(input)) {
      return Promise.all(input);
    }

    return input;
  };
}

test("forum detail returns viewerLiked when request is authenticated", async () => {
  mockAgentCredential("viewer-key", {
    id: "viewer-1",
    name: "Viewer",
  });
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      likeCount: 1,
      agent: createAgentFixture({
        id: "author-1",
        apiKey: "author-key",
        name: "Author",
      }),
    });
  prismaClient.forumLike.findUnique = async () => ({
    id: "like-1",
    postId: "post-1",
    agentId: "viewer-1",
  });
  prismaClient.forumPost.update = async () => ({ id: "post-1" });

  const response = await getForumPost(
    createRouteRequest("http://localhost/api/forum/posts/post-1", {
      apiKey: "viewer-key",
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
  assert.equal(json.success, true);
  assert.equal(json.data.viewerLiked, true);
  assert.equal(json.data.likeCount, 1);
});

test("forum detail deduplicates anonymous views within the same browser window", async () => {
  let updateCalls = 0;
  let createCalls = 0;

  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-1",
      viewCount: 7,
      tags: [],
    });
  prismaClient.forumLike.findUnique = async () => null;
  prismaClient.forumPost.update = async () => {
    updateCalls += 1;
    return createForumPostFixture({ id: "post-1", viewCount: 8 });
  };
  prismaClient.agentCredential = {
    findUnique: async () => null,
    update: async () => ({}),
  };
  prismaClient.forumPostView = {
    create: async () => {
      createCalls += 1;

      if (createCalls > 1) {
        const error = new Error("duplicate");
        (error as Error & { code?: string }).code = "P2002";
        throw error;
      }

      return { id: "view-1" };
    },
  };

  const firstResponse = await getForumPost(
    createRouteRequest("http://localhost/api/forum/posts/post-1", {
      headers: {
        cookie: "forum_viewer=first-browser",
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const firstJson = await firstResponse.json();

  const secondResponse = await getForumPost(
    createRouteRequest("http://localhost/api/forum/posts/post-1", {
      headers: {
        cookie: "forum_viewer=repeat-browser",
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const secondJson = await secondResponse.json();

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  assert.equal(firstJson.data.viewCount, 8);
  assert.equal(secondJson.data.viewCount, 7);
  assert.equal(updateCalls, 1);
  assert.equal(createCalls, 2);
});

test("forum detail skips view tracking for prefetch requests", async () => {
  let updateCalls = 0;
  let createCalls = 0;

  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-1",
      viewCount: 7,
      tags: [],
    });
  prismaClient.forumLike.findUnique = async () => null;
  prismaClient.forumPost.update = async () => {
    updateCalls += 1;
    return createForumPostFixture({ id: "post-1", viewCount: 8 });
  };
  prismaClient.agentCredential = {
    findUnique: async () => null,
    update: async () => ({}),
  };
  prismaClient.forumPostView = {
    create: async () => {
      createCalls += 1;
      return { id: "view-1" };
    },
  };

  const response = await getForumPost(
    createRouteRequest("http://localhost/api/forum/posts/post-1", {
      headers: {
        purpose: "prefetch",
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.viewCount, 7);
  assert.equal(updateCalls, 0);
  assert.equal(createCalls, 0);
});

test("forum detail includes related posts and more from the same author", async () => {
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-1",
      category: "technical",
      viewCount: 7,
      tags: [
        createForumPostTagFixture({
          tag: { id: "tag-1", slug: "api", label: "API", kind: "CORE" },
        }),
      ],
      agent: createAgentFixture({
        id: "author-1",
        apiKey: "author-key",
        name: "Author",
      }),
    });
  prismaClient.forumPost.findMany = async () => [
    createForumPostFixture({
      id: "related-1",
      agentId: "agent-2",
      category: "technical",
      createdAt: "2026-03-18T01:00:00.000Z",
      tags: [
        createForumPostTagFixture({
          tag: { id: "tag-1", slug: "api", label: "API", kind: "CORE" },
        }),
      ],
      _count: { replies: 2 },
      agent: createAgentFixture({
        id: "agent-2",
        apiKey: "agent-key-2",
        name: "Related",
      }),
    }),
    createForumPostFixture({
      id: "author-2",
      agentId: "author-1",
      category: "discussion",
      createdAt: "2026-03-17T01:00:00.000Z",
      tags: [],
      _count: { replies: 1 },
      agent: createAgentFixture({
        id: "author-1",
        apiKey: "author-key",
        name: "Author",
      }),
    }),
  ];
  prismaClient.forumLike.findUnique = async () => null;
  prismaClient.forumPost.update = async () => createForumPostFixture();
  prismaClient.agentCredential = {
    findUnique: async () => null,
    update: async () => ({}),
  };

  const response = await getForumPost(
    createRouteRequest("http://localhost/api/forum/posts/post-1"),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(
    json.data.relatedPosts.map((post: { id: string }) => post.id),
    ["related-1"]
  );
  assert.deepEqual(
    json.data.moreFromAuthor.map((post: { id: string }) => post.id),
    ["author-2"]
  );
});

test("forum replies endpoint returns the created reply payload", async () => {
  mockAgentCredential("reply-key", {
    id: "replier-1",
    name: "Replier",
  });
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-1",
      agentId: "author-1",
    });
  prismaClient.forumReply.create = async () => createForumReplyFixture();
  mockAwardPointsTransaction();

  const response = await createReply(
    createRouteRequest("http://localhost/api/forum/posts/post-1/replies", {
      method: "POST",
      apiKey: "reply-key",
      json: {
        content: "I have a useful reply",
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.content, "I have a useful reply");
});

test("forum replies reject credentials missing forum:write scope", async () => {
  let createCalls = 0;

  mockAgentCredential(
    "reply-key",
    {
      id: "replier-1",
      name: "Replier",
    },
    {
      scopes: ["forum:read"],
    }
  );
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-1",
      agentId: "author-1",
    });
  prismaClient.forumReply.create = async () => {
    createCalls += 1;
    return createForumReplyFixture();
  };
  mockAwardPointsTransaction();

  const response = await createReply(
    createRouteRequest("http://localhost/api/forum/posts/post-1/replies", {
      method: "POST",
      apiKey: "reply-key",
      json: {
        content: "I have a useful reply",
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.error, "Forbidden: Missing required scope forum:write");
  assert.equal(createCalls, 0);
});

test("forum replies hit the abuse limit on repeated writes", async () => {
  mockAgentCredential("reply-key", {
    id: "replier-1",
    name: "Replier",
  });
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-1",
      agentId: "author-1",
    });
  prismaClient.forumReply.create = async () => createForumReplyFixture();
  mockAwardPointsTransaction();

  for (let index = 0; index < 5; index += 1) {
    const response = await createReply(
      createRouteRequest("http://localhost/api/forum/posts/post-1/replies", {
        method: "POST",
        apiKey: "reply-key",
        headers: {
          "x-forwarded-for": "198.51.100.42",
        },
        json: {
          content: `Reply ${index}`,
        },
      }),
      createRouteParams({ id: "post-1" })
    );

    assert.equal(response.status, 200);
  }

  const blocked = await createReply(
    createRouteRequest("http://localhost/api/forum/posts/post-1/replies", {
      method: "POST",
      apiKey: "reply-key",
      headers: {
        "x-forwarded-for": "198.51.100.42",
      },
      json: {
        content: "Reply blocked",
      },
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await blocked.json();

  assert.equal(blocked.status, 429);
  assert.equal(json.error, "Too many requests");
});

test("forum like endpoint rejects self-likes", async () => {
  mockAgentCredential("author-key", {
    id: "author-1",
    name: "Author",
  });
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-1",
      agentId: "author-1",
      agent: createAgentFixture({
        id: "author-1",
        apiKey: "author-key",
        name: "Author",
      }),
    });

  const response = await toggleLike(
    createRouteRequest("http://localhost/api/forum/posts/post-1/like", {
      method: "POST",
      apiKey: "author-key",
    }),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.error, "Cannot like your own post");
});

test("forum like endpoint toggles like state on repeated calls", async () => {
  let liked = false;
  let likeCount = 0;

  mockAgentCredential("viewer-key", {
    id: "viewer-1",
    name: "Viewer",
  });
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-1",
      agentId: "author-1",
      likeCount,
    });
  prismaClient.forumLike.findUnique = async () =>
    liked
      ? {
          id: "like-1",
          postId: "post-1",
          agentId: "viewer-1",
        }
      : null;
  prismaClient.forumLike.create = async () => {
    liked = true;
    return { id: "like-1" };
  };
  prismaClient.forumLike.delete = async () => {
    liked = false;
    return { id: "like-1" };
  };
  prismaClient.forumPost.update = async ({
    data,
  }: {
    data: { likeCount?: { increment?: number; decrement?: number } };
  }) => {
    likeCount += data.likeCount?.increment ?? 0;
    likeCount -= data.likeCount?.decrement ?? 0;
    return { id: "post-1", likeCount };
  };
  mockAwardPointsTransaction();

  const likeResponse = await toggleLike(
    createRouteRequest("http://localhost/api/forum/posts/post-1/like", {
      method: "POST",
      apiKey: "viewer-key",
    }),
    createRouteParams({ id: "post-1" })
  );
  const unlikeResponse = await toggleLike(
    createRouteRequest("http://localhost/api/forum/posts/post-1/like", {
      method: "POST",
      apiKey: "viewer-key",
    }),
    createRouteParams({ id: "post-1" })
  );

  const likedJson = await likeResponse.json();
  const unlikedJson = await unlikeResponse.json();

  assert.equal(likedJson.data.liked, true);
  assert.equal(unlikedJson.data.liked, false);
  assert.equal(likeCount, 0);
});

test("forum like endpoint awards like points only once across unlike and relike", async () => {
  let liked = false;
  let likeCount = 0;
  const pointTransactionRefs: string[] = [];

  mockAgentCredential("viewer-key", {
    id: "viewer-1",
    name: "Viewer",
  });
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-1",
      agentId: "author-1",
      likeCount,
      agent: createAgentFixture({
        id: "author-1",
        apiKey: "author-key",
        name: "Author",
      }),
    });
  prismaClient.forumLike.findUnique = async () =>
    liked
      ? {
          id: "like-1",
          postId: "post-1",
          agentId: "viewer-1",
        }
      : null;
  prismaClient.forumLike.create = async () => {
    liked = true;
    return { id: "like-1" };
  };
  prismaClient.forumLike.delete = async () => {
    liked = false;
    return { id: "like-1" };
  };
  prismaClient.forumPost.update = async ({
    data,
  }: {
    data: { likeCount?: { increment?: number; decrement?: number } };
  }) => {
    likeCount += data.likeCount?.increment ?? 0;
    likeCount -= data.likeCount?.decrement ?? 0;
    return { id: "post-1", likeCount };
  };
  prismaClient.pointTransaction.findFirst = async ({
    where,
  }: {
    where: { referenceId?: string | null };
  }) =>
    pointTransactionRefs.includes(String(where.referenceId))
      ? { id: "txn-1" }
      : null;
  prismaClient.pointTransaction.create = async ({
    data,
  }: {
    data: { referenceId?: string | null };
  }) => {
    pointTransactionRefs.push(String(data.referenceId));
    return data;
  };
  prismaClient.agent.update = async () => ({ id: "author-1" });
  prismaClient.$transaction = async (input: unknown) => {
    if (typeof input === "function") {
      return input({
        forumLike: {
          create: prismaClient.forumLike.create,
          delete: prismaClient.forumLike.delete,
        },
        forumPost: {
          update: prismaClient.forumPost.update,
        },
        pointTransaction: {
          findFirst: prismaClient.pointTransaction.findFirst,
          create: prismaClient.pointTransaction.create,
        },
        agent: {
          update: prismaClient.agent.update,
        },
      });
    }

    if (Array.isArray(input)) {
      return Promise.all(input);
    }

    return input;
  };

  await toggleLike(
    createRouteRequest("http://localhost/api/forum/posts/post-1/like", {
      method: "POST",
      apiKey: "viewer-key",
    }),
    createRouteParams({ id: "post-1" })
  );
  await toggleLike(
    createRouteRequest("http://localhost/api/forum/posts/post-1/like", {
      method: "POST",
      apiKey: "viewer-key",
    }),
    createRouteParams({ id: "post-1" })
  );
  const relikeResponse = await toggleLike(
    createRouteRequest("http://localhost/api/forum/posts/post-1/like", {
      method: "POST",
      apiKey: "viewer-key",
    }),
    createRouteParams({ id: "post-1" })
  );
  const relikeJson = await relikeResponse.json();

  assert.equal(relikeResponse.status, 200);
  assert.equal(relikeJson.data.liked, true);
  assert.equal(pointTransactionRefs.length, 1);
});

test("forum post creation rejects unclaimed agents before insertion", async () => {
  let createCalls = 0;

  mockAgentCredential("author-key", {
    id: "author-1",
    ownerUserId: null,
    claimStatus: "UNCLAIMED",
    claimedAt: null,
  });
  prismaClient.forumPost.create = async () => {
    createCalls += 1;
    return createForumPostFixture();
  };

  const response = await createPost(
    createRouteRequest("http://localhost/api/forum/posts", {
      method: "POST",
      apiKey: "author-key",
      json: {
        title: "Unauthorized post",
        content: "Should not be created",
        category: "general",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
  assert.equal(json.error, "Unauthorized: Invalid or missing API key");
  assert.equal(createCalls, 0);
});

test("forum post creation returns normalized tags for the created post", async () => {
  mockAgentCredential("author-key", {
    id: "author-1",
    name: "Author",
  });
  prismaClient.forumPost.create = async ({ data }: { data: Record<string, string> }) =>
    createForumPostFixture({
      id: "post-1",
      title: data.title,
      content: data.content,
      category: data.category,
      tags: [],
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      agent: createAgentFixture({
        id: data.agentId,
        apiKey: "author-key",
        name: "Author",
      }),
    });
  prismaClient.forumTag = {
    upsert: async ({ where }: { where: { slug: string } }) => ({
      id: `tag-${where.slug}`,
      slug: where.slug,
      label: where.slug.toUpperCase(),
      kind: "CORE",
    }),
  };
  prismaClient.forumPostTag = {
    createMany: async () => ({ count: 2 }),
  };
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-1",
      title: "API deployment bugfix",
      content: "Need to deploy a fix for the API timeout",
      category: "technical",
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      tags: [
        createForumPostTagFixture({
          tag: { id: "tag-api", slug: "api", label: "API", kind: "CORE" },
        }),
        createForumPostTagFixture({
          id: "post-tag-2",
          tag: {
            id: "tag-deployment",
            slug: "deployment",
            label: "Deployment",
            kind: "CORE",
          },
        }),
      ],
    });
  mockAwardPointsTransaction();

  const response = await createPost(
    createRouteRequest("http://localhost/api/forum/posts", {
      method: "POST",
      apiKey: "author-key",
      json: {
        title: "API deployment bugfix",
        content: "Need to deploy a fix for the API timeout",
        category: "technical",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data.tags));
  assert.ok(json.data.tags.some((tag: { slug: string }) => tag.slug === "api"));
});

test("forum post creation accepts suggestedTags and still returns normalized tags", async () => {
  mockAgentCredential("author-key", {
    id: "author-1",
    name: "Author",
  });
  prismaClient.forumPost.create = async ({ data }: { data: Record<string, string> }) =>
    createForumPostFixture({
      id: "post-2",
      title: data.title,
      content: data.content,
      category: data.category,
      tags: [],
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      agent: createAgentFixture({
        id: data.agentId,
        apiKey: "author-key",
        name: "Author",
      }),
    });
  prismaClient.forumTag = {
    upsert: async ({ where, create, update }: { where: { slug: string }; create: { label: string; kind: string }; update: { label: string; kind: string } }) => ({
      id: `tag-${where.slug}`,
      slug: where.slug,
      label: create.label ?? update.label,
      kind: create.kind ?? update.kind,
    }),
  };
  prismaClient.forumPostTag = {
    createMany: async () => ({ count: 2 }),
  };
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-2",
      title: "Team update",
      content: "Sharing notes",
      category: "discussion",
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      tags: [
        createForumPostTagFixture({
          tag: { id: "tag-api", slug: "api", label: "API", kind: "CORE" },
        }),
        createForumPostTagFixture({
          id: "post-tag-2",
          tag: {
            id: "tag-release-prep",
            slug: "release-prep",
            label: "release prep",
            kind: "FREEFORM",
          },
        }),
      ],
    });
  mockAwardPointsTransaction();

  const response = await createPost(
    createRouteRequest("http://localhost/api/forum/posts", {
      method: "POST",
      apiKey: "author-key",
      json: {
        title: "Team update",
        content: "Sharing notes",
        category: "discussion",
        suggestedTags: [
          "API",
          "release prep",
          "When an agent posts a thread without punctuation the extractor keeps the whole sentence",
        ],
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data.tags));
  assert.ok(json.data.tags.some((tag: { slug: string }) => tag.slug === "api"));
  assert.ok(json.data.tags.some((tag: { slug: string }) => tag.slug === "release-prep"));
});

test("forum post creation defaults category to general when omitted", async () => {
  let capturedCategory = "";

  mockAgentCredential("author-key", {
    id: "author-1",
    name: "Author",
  });
  prismaClient.forumPost.create = async ({ data }: { data: Record<string, string> }) => {
    capturedCategory = data.category;

    return createForumPostFixture({
      id: "post-default-category",
      title: data.title,
      content: data.content,
      category: data.category,
      tags: [],
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      agent: createAgentFixture({
        id: data.agentId,
        apiKey: "author-key",
        name: "Author",
      }),
    });
  };
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      id: "post-default-category",
      category: "general",
      tags: [],
    });
  mockAwardPointsTransaction();

  const response = await createPost(
    createRouteRequest("http://localhost/api/forum/posts", {
      method: "POST",
      apiKey: "author-key",
      json: {
        title: "Default category",
        content: "No explicit category",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(capturedCategory, "general");
});

test("forum post creation rejects invalid categories", async () => {
  let createCalls = 0;

  mockAgentCredential("author-key", {
    id: "author-1",
    name: "Author",
  });
  prismaClient.forumPost.create = async () => {
    createCalls += 1;
    return createForumPostFixture();
  };

  const response = await createPost(
    createRouteRequest("http://localhost/api/forum/posts", {
      method: "POST",
      apiKey: "author-key",
      json: {
        title: "Invalid category",
        content: "This should fail",
        category: "weird",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(
    json.error,
    "category must be one of general, technical, discussion"
  );
  assert.equal(createCalls, 0);
});
