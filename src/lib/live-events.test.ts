import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  createLiveEventStream,
  publishEvent,
  resetLiveEventsForTest,
  subscribeToLiveEvents,
} from "./live-events";

const textDecoder = new TextDecoder();

function decodeChunk(value?: Uint8Array) {
  return value ? textDecoder.decode(value) : "";
}

function parseEventData(chunk: string) {
  const dataLine = chunk
    .split("\n")
    .find((line) => line.startsWith("data: "));

  assert.ok(dataLine, `Missing data line in chunk: ${chunk}`);

  return JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
}

afterEach(() => {
  resetLiveEventsForTest();
});

test("publishEvent fan-outs normalized payloads to subscribers", () => {
  const receivedByFirst: Array<Record<string, unknown>> = [];
  const receivedBySecond: Array<Record<string, unknown>> = [];

  const unsubscribeFirst = subscribeToLiveEvents((event) => {
    receivedByFirst.push(event as unknown as Record<string, unknown>);
  });
  const unsubscribeSecond = subscribeToLiveEvents((event) => {
    receivedBySecond.push(event as unknown as Record<string, unknown>);
  });

  const published = publishEvent({
    type: "agent.status.updated",
    occurredAt: "2026-03-07T00:00:00.000Z",
    payload: {
      previousStatus: "OFFLINE",
      agent: {
        id: "agent-1",
        name: "Alpha",
        type: "OPENCLAW",
        status: "ONLINE",
        points: 42,
      },
    },
  });

  unsubscribeFirst();
  unsubscribeSecond();

  assert.equal(receivedByFirst.length, 1);
  assert.equal(receivedBySecond.length, 1);
  assert.match(published.id, /^evt_/);
  assert.equal(published.type, "agent.status.updated");
  assert.equal(published.occurredAt, "2026-03-07T00:00:00.000Z");
  assert.deepEqual(receivedByFirst[0], published);
  assert.deepEqual(receivedBySecond[0], published);
});

test("event stream serializes task and forum updates consistently", async () => {
  const stream = createLiveEventStream({
    includeReadyEvent: false,
    pingIntervalMs: 60_000,
  });
  const reader = stream.getReader();

  const taskEvent = publishEvent({
    type: "task.claimed",
    occurredAt: "2026-03-07T01:00:00.000Z",
    payload: {
      previousStatus: "OPEN",
      task: {
        id: "task-1",
        title: "Fix lobby",
        status: "CLAIMED",
        creatorId: "creator-1",
        assigneeId: "assignee-1",
        bountyPoints: 15,
        completedAt: null,
      },
    },
  });

  const firstChunk = decodeChunk((await reader.read()).value);
  assert.match(firstChunk, /^id: /);
  assert.match(firstChunk, /event: live-event/);
  assert.deepEqual(parseEventData(firstChunk), taskEvent);

  const forumEvent = publishEvent({
    type: "forum.post.created",
    occurredAt: "2026-03-07T01:05:00.000Z",
    payload: {
      post: {
        id: "post-1",
        title: "Release notes",
        category: "general",
        createdAt: "2026-03-07T01:05:00.000Z",
        likeCount: 0,
        replyCount: 0,
        agent: {
          id: "agent-1",
          name: "Alpha",
          type: "OPENCLAW",
        },
      },
    },
  });

  const secondChunk = decodeChunk((await reader.read()).value);
  assert.match(secondChunk, /^id: /);
  assert.match(secondChunk, /event: live-event/);
  assert.deepEqual(parseEventData(secondChunk), forumEvent);

  await reader.cancel();
});
