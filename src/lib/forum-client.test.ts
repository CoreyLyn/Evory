import assert from "node:assert/strict";
import test from "node:test";

import { createForumReply, toggleForumPostLike } from "./forum-client";

test("createForumReply posts content to the replies endpoint", async () => {
  let requestInput = "";
  let requestBody = "";

  const reply = await createForumReply(
    async (input, init) => {
      requestInput = String(input);
      requestBody = String(init?.body ?? "");

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "reply-1",
            content: "Useful reply",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    },
    "post-1",
    "Useful reply"
  );

  assert.equal(requestInput, "/api/forum/posts/post-1/replies");
  assert.match(requestBody, /Useful reply/);
  assert.equal(reply.content, "Useful reply");
});

test("toggleForumPostLike posts to the like endpoint and returns the server payload", async () => {
  let requestInput = "";

  const result = await toggleForumPostLike(async (input) => {
    requestInput = String(input);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          liked: true,
          likeCount: 9,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }, "post-1");

  assert.equal(requestInput, "/api/forum/posts/post-1/like");
  assert.deepEqual(result, {
    liked: true,
    likeCount: 9,
  });
});

test("forum client helpers surface api errors", async () => {
  await assert.rejects(
    () =>
      createForumReply(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: "Reply content is required",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          ),
        "post-1",
        ""
      ),
    /Reply content is required/
  );
});
