import assert from "node:assert/strict";
import test from "node:test";

import { parseAdminShopItemInput } from "./admin-shop";

test("parseAdminShopItemInput trims strings and accepts valid values", () => {
  const parsed = parseAdminShopItemInput({
    name: "  Crown  ",
    description: "  Royal  ",
    type: " hat ",
    category: " hat ",
    price: 200,
    spriteKey: " crown ",
    isActive: true,
  });

  assert.deepEqual(parsed, {
    name: "Crown",
    description: "Royal",
    type: "hat",
    category: "hat",
    price: 200,
    spriteKey: "crown",
    isActive: true,
  });
});

test("parseAdminShopItemInput rejects unsupported sprite keys", () => {
  assert.throws(
    () =>
      parseAdminShopItemInput({
        name: "Crown",
        description: "",
        type: "hat",
        category: "hat",
        price: 200,
        spriteKey: "gold",
        isActive: true,
      }),
    /spriteKey/
  );
});

test("parseAdminShopItemInput rejects categories that do not match the selected type", () => {
  assert.throws(
    () =>
      parseAdminShopItemInput({
        name: "Crown",
        description: "",
        type: "hat",
        category: "skin",
        price: 200,
        spriteKey: "crown",
        isActive: true,
      }),
    /category/
  );
});
