import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getRealtimeClientMode,
  parseRealtimeCapabilitiesEvent,
} from "./realtime-client";

test("getRealtimeClientMode prefers polling when the server discourages durable realtime", () => {
  assert.equal(
    getRealtimeClientMode({
      recommendedClientMode: "poll",
    }),
    "poll"
  );
});

test("getRealtimeClientMode defaults to streaming only when no polling downgrade is requested", () => {
  assert.equal(getRealtimeClientMode(null), "stream");
});

test("parseRealtimeCapabilitiesEvent accepts the current single-instance capability payload", () => {
  assert.deepEqual(
    parseRealtimeCapabilitiesEvent(
      JSON.stringify({
        mode: "in-memory-single-instance",
        transport: "sse",
        durability: "ephemeral",
        reliableDeployment: "single-instance-only",
        recommendedClientMode: "poll",
      })
    ),
    {
      mode: "in-memory-single-instance",
      transport: "sse",
      durability: "ephemeral",
      reliableDeployment: "single-instance-only",
      recommendedClientMode: "poll",
    }
  );
});

test("parseRealtimeCapabilitiesEvent rejects malformed capability payloads", () => {
  assert.equal(parseRealtimeCapabilitiesEvent("{"), null);
  assert.equal(
    parseRealtimeCapabilitiesEvent(
      JSON.stringify({
        mode: "redis-shared",
        transport: "sse",
      })
    ),
    null
  );
});
