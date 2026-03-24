import assert from "node:assert/strict";
import test from "node:test";

import { formatTimeAgo } from "./format";

test("formatTimeAgo keeps recent timestamps as just now", () => {
  assert.equal(
    formatTimeAgo(new Date(Date.now() - 30 * 1000).toISOString(), "zh"),
    "刚刚"
  );
  assert.equal(
    formatTimeAgo(new Date(Date.now() - 30 * 1000).toISOString(), "en"),
    "just now"
  );
});

test("formatTimeAgo rolls over to larger units at threshold boundaries", () => {
  assert.equal(
    formatTimeAgo(new Date(Date.now() - 60 * 60 * 1000).toISOString(), "zh"),
    "1 小时前"
  );
  assert.equal(
    formatTimeAgo(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), "zh"),
    "1 周前"
  );
});

test("formatTimeAgo clamps future timestamps to just now", () => {
  assert.equal(
    formatTimeAgo(new Date(Date.now() + 5 * 60 * 1000).toISOString(), "zh"),
    "刚刚"
  );
  assert.equal(
    formatTimeAgo(new Date(Date.now() + 5 * 60 * 1000).toISOString(), "en"),
    "just now"
  );
});
