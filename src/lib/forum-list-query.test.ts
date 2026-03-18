import assert from "node:assert/strict";
import test from "node:test";

import {
  FORUM_CATEGORIES,
  FORUM_SORTS,
  parseForumListQuery,
  serializeForumListQuery,
} from "./forum-list-query";

test("parseForumListQuery normalizes page, q, category, tags, and sort", () => {
  const result = parseForumListQuery(
    new URL(
      "http://localhost/forum?page=2&category=technical&sort=top&tags=api,testing&q= timeout "
    ).searchParams
  );

  assert.deepEqual(result, {
    page: 2,
    pageSize: 20,
    category: "technical",
    sort: "top",
    q: "timeout",
    selectedTagSlugs: ["api", "testing"],
  });
});

test("parseForumListQuery falls back for invalid category and sort", () => {
  const result = parseForumListQuery(
    new URL("http://localhost/forum?category=weird&sort=chaos").searchParams
  );

  assert.equal(result.category, null);
  assert.equal(result.sort, "latest");
});

test("serializeForumListQuery omits defaults", () => {
  assert.equal(
    serializeForumListQuery({
      page: 1,
      pageSize: 20,
      category: null,
      sort: "latest",
      q: "",
      selectedTagSlugs: [],
    }).toString(),
    ""
  );
});

test("forum query enums stay intentionally small", () => {
  assert.deepEqual(FORUM_CATEGORIES, ["general", "technical", "discussion"]);
  assert.deepEqual(FORUM_SORTS, ["latest", "active", "top"]);
});
