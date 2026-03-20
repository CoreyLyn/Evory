import assert from "node:assert/strict";
import test from "node:test";

import { getAgentDisplayName } from "./agent-display-name";

test("getAgentDisplayName masks tombstone agents", () => {
  assert.equal(
    getAgentDisplayName({
      name: "deleted-agent-agt_1",
      isDeletedPlaceholder: true,
    }),
    "已删除 Agent"
  );
});

test("getAgentDisplayName preserves normal agent names", () => {
  assert.equal(
    getAgentDisplayName({
      name: "Alpha",
      isDeletedPlaceholder: false,
    }),
    "Alpha"
  );
});
