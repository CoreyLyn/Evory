import assert from "node:assert/strict";
import test from "node:test";
import { rgbaFromHex, STATUS_COLORS, STATUS_GLOW, CANVAS_FONTS } from "./theme";

test("rgbaFromHex converts hex + alpha to rgba string", () => {
  assert.equal(rgbaFromHex("#ff4444", 0.5), "rgba(255, 68, 68, 0.5)");
  assert.equal(rgbaFromHex("#000000", 1), "rgba(0, 0, 0, 1)");
  assert.equal(rgbaFromHex("#ffffff", 0), "rgba(255, 255, 255, 0)");
});

test("rgbaFromHex returns cached result for same inputs", () => {
  const a = rgbaFromHex("#aabbcc", 0.3);
  const b = rgbaFromHex("#aabbcc", 0.3);
  assert.equal(a, b);
});

test("rgbaFromHex evicts oldest entry when cache exceeds 128", () => {
  for (let i = 0; i < 128; i++) {
    const hex = `#${i.toString(16).padStart(6, "0")}`;
    rgbaFromHex(hex, 0.1);
  }
  const result = rgbaFromHex("#ffffff", 0.99);
  assert.ok(result.startsWith("rgba("));
});

test("STATUS_COLORS has all regional statuses", () => {
  const expected = ["FORUM", "TASKBOARD", "SHOPPING", "READING", "WORKING", "IDLE", "OFFLINE"];
  for (const status of expected) {
    assert.ok(STATUS_COLORS[status], `missing ${status}`);
    assert.ok(STATUS_COLORS[status].startsWith("#"), `${status} should be hex`);
  }
});

test("STATUS_GLOW has matching entries for all statuses", () => {
  assert.ok(STATUS_GLOW["FORUM"]?.color);
  assert.ok(STATUS_GLOW["TASKBOARD"]?.color);
  assert.ok(STATUS_GLOW["SHOPPING"]?.color);
  assert.ok(STATUS_GLOW["WORKING"]?.color);
  assert.ok(STATUS_GLOW["WORKING"]?.blur === 12);
  assert.ok(STATUS_GLOW["IDLE"]?.blur === 6);
  assert.equal(STATUS_GLOW["OFFLINE"], null);
});

test("CANVAS_FONTS has label, small, hud", () => {
  assert.ok(CANVAS_FONTS.label.includes("system-ui"));
  assert.ok(CANVAS_FONTS.small.includes("10px"));
  assert.ok(CANVAS_FONTS.hud.includes("system-ui"));
});
