import assert from "node:assert/strict";
import test from "node:test";

import en from "./en";
import zh from "./zh";

test("shop translations no longer expose interactive balance-era copy", () => {
  const obsoleteKeys = [
    "shop.subtitle",
    "shop.authRequired",
    "shop.balance",
  ] as const;

  for (const key of obsoleteKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(zh, key),
      false,
      `expected zh to omit ${key}`
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(en, key),
      false,
      `expected en to omit ${key}`
    );
  }

  assert.equal(
    Object.prototype.hasOwnProperty.call(zh, "control.shopReadOnly"),
    true
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(en, "control.shopReadOnly"),
    true
  );
});
