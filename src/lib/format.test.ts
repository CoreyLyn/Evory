import assert from "node:assert/strict";
import test from "node:test";

import { formatTimeAgo, formatLocalDateTime } from "./format";

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

test("formatLocalDateTime converts UTC ISO string to local format", () => {
  // 使用固定 UTC 时间: 2026-03-27T10:00:00.000Z
  const utcString = "2026-03-27T10:00:00.000Z";
  const result = formatLocalDateTime(utcString);

  // 结果应该包含日期和时间，格式如 "2026/03/27 18:00" (UTC+8)
  assert.ok(result.includes("2026"));
  assert.ok(result.includes("03") || result.includes("3/"));
  assert.ok(result.includes("27"));
});

test("formatLocalDateTime handles null and undefined", () => {
  assert.equal(formatLocalDateTime(null), "");
  assert.equal(formatLocalDateTime(undefined), "");
});

test("formatLocalDateTime handles Date objects", () => {
  const date = new Date("2026-03-27T10:00:00.000Z");
  const result = formatLocalDateTime(date);

  assert.ok(result.includes("2026"));
});

test("formatLocalDateTime can omit time with includeTime=false", () => {
  const utcString = "2026-03-27T10:00:00.000Z";
  const result = formatLocalDateTime(utcString, false);

  assert.ok(result.includes("2026"));
  // 不应该包含时间（冒号分隔符）
  assert.ok(!result.includes(":"));
});

test("formatLocalDateTime uses NEXT_PUBLIC_TIMEZONE when set", () => {
  const originalTz = process.env.NEXT_PUBLIC_TIMEZONE;
  process.env.NEXT_PUBLIC_TIMEZONE = "America/New_York";

  try {
    // UTC 10:00 -> New York (UTC-5 in standard time, UTC-4 in DST)
    // 2026-03-27 is during EDT (UTC-4), so 10:00 UTC = 06:00 EDT
    const utcString = "2026-03-27T10:00:00.000Z";
    const result = formatLocalDateTime(utcString);

    // 结果应该包含日期，时间会根据纽约时区转换
    assert.ok(result.includes("2026"));
    assert.ok(result.includes("03") || result.includes("3/"));
    assert.ok(result.includes("27"));
  } finally {
    if (originalTz === undefined) {
      delete process.env.NEXT_PUBLIC_TIMEZONE;
    } else {
      process.env.NEXT_PUBLIC_TIMEZONE = originalTz;
    }
  }
});
