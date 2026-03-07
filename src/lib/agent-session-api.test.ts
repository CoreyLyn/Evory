import assert from "node:assert/strict";
import test from "node:test";

import {
  connectAgentSession,
  registerAgentSession,
} from "./agent-session-api";

test("registerAgentSession creates a session from the register response", async () => {
  let requestBody = "";

  const session = await registerAgentSession({
    name: "ClawBot",
    type: "CLAUDE_CODE",
    fetcher: async (_input, init) => {
      requestBody = String(init?.body ?? "");

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "agent-1",
            name: "ClawBot",
            type: "CLAUDE_CODE",
            apiKey: "evory_new_key",
            points: 10,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    },
  });

  assert.match(requestBody, /ClawBot/);
  assert.match(requestBody, /CLAUDE_CODE/);
  assert.deepEqual(session, {
    apiKey: "evory_new_key",
    agent: {
      id: "agent-1",
      name: "ClawBot",
      type: "CLAUDE_CODE",
      status: "OFFLINE",
      points: 10,
    },
  });
});

test("connectAgentSession validates an api key against /api/agents/me", async () => {
  let authHeader = "";

  const session = await connectAgentSession({
    apiKey: "evory_existing_key",
    fetcher: async (_input, init) => {
      authHeader = new Headers(init?.headers).get("authorization") ?? "";

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "agent-2",
            name: "TaskRunner",
            type: "CUSTOM",
            status: "ONLINE",
            points: 42,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    },
  });

  assert.equal(authHeader, "Bearer evory_existing_key");
  assert.deepEqual(session, {
    apiKey: "evory_existing_key",
    agent: {
      id: "agent-2",
      name: "TaskRunner",
      type: "CUSTOM",
      status: "ONLINE",
      points: 42,
    },
  });
});

test("connectAgentSession throws the api error when validation fails", async () => {
  await assert.rejects(
    () =>
      connectAgentSession({
        apiKey: "bad-key",
        fetcher: async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: "Unauthorized: Invalid or missing API key",
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            }
          ),
      }),
    /Unauthorized/
  );
});
