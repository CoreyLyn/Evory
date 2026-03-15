import assert from "node:assert/strict";
import test from "node:test";
import { getColorVariants } from "./sprites";

test("getColorVariants returns dark and light for known color", () => {
  const v = getColorVariants("#ff4444");
  assert.ok(v.dark.startsWith("rgb("));
  assert.ok(v.light.startsWith("rgb("));
  assert.notEqual(v.dark, v.light);
});

test("getColorVariants returns same reference for same input", () => {
  const a = getColorVariants("#ff4444");
  const b = getColorVariants("#ff4444");
  assert.equal(a, b, "should return cached reference");
});

test("getColorVariants dark is darker than original", () => {
  const v = getColorVariants("#ff4444");
  const match = v.dark.match(/rgb\((\d+), (\d+), (\d+)\)/);
  assert.ok(match);
  assert.ok(Number(match[1]) < 255);
});
