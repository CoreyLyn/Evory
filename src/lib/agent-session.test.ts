import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_SESSION_STORAGE_KEY,
  clearAgentSession,
  loadAgentSession,
  saveAgentSession,
  subscribeAgentSession,
  type AgentSession,
} from "./agent-session";
import { createAgentFetch } from "./agent-client";

type MockStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createStorage(initial: Record<string, string> = {}): MockStorage {
  const data = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function createSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    apiKey: "evory_test_key",
    agent: {
      id: "agent-1",
      name: "ClawBot",
      type: "CUSTOM",
      status: "OFFLINE",
      points: 10,
    },
    ...overrides,
  };
}

test("loadAgentSession returns null when storage is empty", () => {
  const storage = createStorage();

  assert.equal(loadAgentSession(storage), null);
});

test("saveAgentSession persists the serialized session", () => {
  const storage = createStorage();
  const session = createSession();

  saveAgentSession(session, storage);

  assert.deepEqual(
    JSON.parse(storage.getItem(AGENT_SESSION_STORAGE_KEY) ?? "null"),
    session
  );
});

test("loadAgentSession ignores invalid persisted payloads", () => {
  const storage = createStorage({
    [AGENT_SESSION_STORAGE_KEY]: JSON.stringify({
      apiKey: "",
      agent: { id: "agent-1" },
    }),
  });

  assert.equal(loadAgentSession(storage), null);
});

test("subscribeAgentSession notifies listeners on save and clear", () => {
  const storage = createStorage();
  const session = createSession();
  const events: Array<AgentSession | null> = [];

  const unsubscribe = subscribeAgentSession((value) => {
    events.push(value);
  });

  saveAgentSession(session, storage);
  clearAgentSession(storage);
  unsubscribe();

  assert.deepEqual(events, [session, null]);
});

test("createAgentFetch injects Authorization header from the current session", async () => {
  const session = createSession({ apiKey: "evory_live_key" });
  let requestHeaders: Headers | undefined;

  const agentFetch = createAgentFetch({
    fetcher: async (_input, init) => {
      requestHeaders = init?.headers instanceof Headers
        ? init.headers
        : new Headers(init?.headers);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    getSession: () => session,
  });

  await agentFetch("/api/forum/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(
    requestHeaders?.get("authorization"),
    "Bearer evory_live_key"
  );
  assert.equal(requestHeaders?.get("content-type"), "application/json");
});

test("createAgentFetch throws when there is no active agent session", async () => {
  const agentFetch = createAgentFetch({
    fetcher: async () => new Response(null, { status: 204 }),
    getSession: () => null,
  });

  await assert.rejects(
    () =>
      agentFetch("/api/forum/posts", {
        method: "POST",
      }),
    /No active agent session/
  );
});
