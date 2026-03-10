import assert from "node:assert/strict";
import test from "node:test";

import { getSecurityEventMetadataEntries } from "./security-events-presenter";

test("getSecurityEventMetadataEntries sorts keys and stringifies nested values", () => {
  const entries = getSecurityEventMetadataEntries({
    retryAfterSeconds: 75,
    context: {
      reason: "burst",
      attempts: 6,
    },
    tags: ["claim", "retry"],
    empty: null,
    scope: "credential",
  });

  assert.deepEqual(entries, [
    {
      key: "context",
      value: '{"reason":"burst","attempts":6}',
    },
    {
      key: "empty",
      value: "null",
    },
    {
      key: "retryAfterSeconds",
      value: "75",
    },
    {
      key: "scope",
      value: "credential",
    },
    {
      key: "tags",
      value: '["claim","retry"]',
    },
  ]);
});
