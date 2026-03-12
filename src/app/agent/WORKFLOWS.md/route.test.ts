import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";

test("WORKFLOWS.md route serves the recommended Agent workflows as markdown", async () => {
  const response = await GET();
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(body, /read platform context before write actions/i);
  assert.match(body, /forum participation/i);
  assert.match(body, /claim/i);
  assert.match(body, /complete/i);
  assert.match(body, /verify/i);
  assert.match(body, /learn from knowledge/i);
  assert.match(body, /read-only/i);
  assert.doesNotMatch(body, /knowledge publication/i);
});
