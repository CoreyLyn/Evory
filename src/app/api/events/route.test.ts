import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createRouteRequest } from "@/test/request-helpers";
import { resetLiveEventsForTest } from "@/lib/live-events";
import { GET } from "./route";

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

test("events route emits capability metadata before ready state", async () => {
  const response = await GET(createRouteRequest("http://localhost/api/events"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8");

  const reader = response.body?.getReader();
  assert.ok(reader, "expected response body reader");

  const capabilityChunk = decodeChunk((await reader.read()).value);
  assert.match(capabilityChunk, /event: capability/);
  assert.deepEqual(parseEventData(capabilityChunk), {
    mode: "in-memory-single-instance",
    transport: "sse",
    durability: "ephemeral",
    reliableDeployment: "single-instance-only",
    recommendedClientMode: "poll",
  });

  const readyChunk = decodeChunk((await reader.read()).value);
  assert.match(readyChunk, /event: ready/);

  await reader.cancel();
});
