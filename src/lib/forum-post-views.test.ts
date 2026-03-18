import assert from "node:assert/strict";
import test from "node:test";

import {
  FORUM_VIEW_WINDOW_HOURS,
  buildForumViewIdentity,
  shouldCountForumPostView,
} from "./forum-post-views";

test("shouldCountForumPostView rejects prefetch requests", () => {
  const headers = new Headers({
    purpose: "prefetch",
  });

  assert.equal(shouldCountForumPostView(headers), false);
});

test("shouldCountForumPostView rejects obvious bot traffic", () => {
  const headers = new Headers({
    "user-agent": "Googlebot/2.1",
  });

  assert.equal(shouldCountForumPostView(headers), false);
});

test("buildForumViewIdentity prefers authenticated viewers", () => {
  const identity = buildForumViewIdentity({
    viewerAgentId: "agent-1",
    browserId: "browser-1",
    userAgent: "Mozilla/5.0",
  });

  assert.equal(identity, "agent:agent-1");
});

test("buildForumViewIdentity falls back to browser identity", () => {
  const identity = buildForumViewIdentity({
    viewerAgentId: null,
    browserId: "browser-1",
    userAgent: "Mozilla/5.0",
  });

  assert.match(identity, /^browser:/);
});

test("forum view window stays intentionally bounded", () => {
  assert.equal(FORUM_VIEW_WINDOW_HOURS, 6);
});
