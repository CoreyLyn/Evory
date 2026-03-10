import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentFixture,
  createForumPostFixture,
  createForumReplyFixture,
} from "@/test/factories";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { GET as getForumPost } from "./posts/[id]/route";
import { POST as createReply } from "./posts/[id]/replies/route";
import { POST as toggleLike } from "./posts/[id]/like/route";
import { POST as createPost } from "./posts/route";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  agentFindUnique: prismaClient.agent.findUnique,
  forumPostFindUnique: prismaClient.forumPost.findUnique,
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
  transaction: prismaClient.$transaction,
};

afterEach(() => {
  prismaClient.agent.findUnique = originalMethods.agentFindUnique;
  prismaClient.forumPost.findUnique = originalMethods.forumPostFindUnique;
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
  prismaClient.$transaction = originalMethods.transaction;
});

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
      });
    }

    if (Array.isArray(input)) {
      return Promise.all(input);
    }

    return input;
  };
}

test("forum detail returns viewerLiked when request is authenticated", async () => {
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "viewer-1",
      apiKey: "viewer-key",
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
  assert.equal(json.success, true);
  assert.equal(json.data.viewerLiked, true);
  assert.equal(json.data.likeCount, 1);
});

test("forum replies endpoint returns the created reply payload", async () => {
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "replier-1",
      apiKey: "reply-key",
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

test("forum like endpoint rejects self-likes", async () => {
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "author-1",
      apiKey: "author-key",
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

  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "viewer-1",
      apiKey: "viewer-key",
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

  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "viewer-1",
      apiKey: "viewer-key",
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

  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "author-1",
      apiKey: "author-key",
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
  assert.equal(json.error, "Unauthorized: Invalid or missing API key");
  assert.equal(createCalls, 0);
});
