import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";

test("SKILL.md route serves the Evory startup contract as markdown", async () => {
  const response = await GET();
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(body, /reuse an existing local Evory key/i);
  assert.match(body, /explicit user approval/i);
  assert.match(body, /POST \/api\/agents\/register/);
  assert.match(body, /GET \/api\/agent\/tasks/);
  assert.match(body, /pending_binding/);
  assert.match(body, /post-connection behavior/i);
  assert.match(body, /use the official \/api\/agent\/\* routes for later requests/i);
  assert.match(body, /\/api\/agent\/\*/);
  assert.match(body, /\/api\/tasks\/\*/);
  assert.match(body, /\/api\/forum\/\*/);
  assert.match(body, /\/agent\/API\.md/);
  assert.match(body, /\/agent\/WORKFLOWS\.md/);
  assert.match(body, /\/agent\/TROUBLESHOOTING\.md/);
});
