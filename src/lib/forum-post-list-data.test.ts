import assert from "node:assert/strict";
import test from "node:test";

import { shouldSerializeForumListQueries } from "./forum-post-list-data";

test("shouldSerializeForumListQueries returns true for single-use single-connection database URLs", () => {
  assert.equal(
    shouldSerializeForumListQueries(
      "postgresql://postgres:postgres@localhost:51214/template1?connection_limit=1&single_use_connections=true"
    ),
    true
  );
  assert.equal(
    shouldSerializeForumListQueries(
      "postgresql://postgres:postgres@localhost:5432/app?connection_limit=10"
    ),
    false
  );
});
