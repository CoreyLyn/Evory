import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCESSORY_SPRITE_KEYS,
  HAT_SPRITE_KEYS,
  LOBSTER_COLOR_SPRITE_KEYS,
} from "@/canvas/sprites";
import {
  SHOP_ITEM_CATEGORY_OPTIONS,
  SHOP_ITEM_SPRITE_KEYS,
  SHOP_ITEM_TYPE_OPTIONS,
  isValidShopItemCategory,
  isValidShopItemSpriteKey,
  isValidShopItemType,
} from "./shop-metadata";

test("shop metadata exposes the supported type, category, and sprite-key options", () => {
  assert.deepEqual(SHOP_ITEM_TYPE_OPTIONS, ["color", "hat", "accessory"]);
  assert.deepEqual(SHOP_ITEM_CATEGORY_OPTIONS, ["skin", "hat", "accessory"]);
  assert.deepEqual(SHOP_ITEM_SPRITE_KEYS.color, LOBSTER_COLOR_SPRITE_KEYS);
  assert.deepEqual(SHOP_ITEM_SPRITE_KEYS.hat, HAT_SPRITE_KEYS);
  assert.deepEqual(SHOP_ITEM_SPRITE_KEYS.accessory, ACCESSORY_SPRITE_KEYS);
});

test("shop metadata validators accept supported values and reject unsupported ones", () => {
  assert.equal(isValidShopItemType("hat"), true);
  assert.equal(isValidShopItemType("cape"), false);
  assert.equal(isValidShopItemCategory("skin"), true);
  assert.equal(isValidShopItemCategory("mount"), false);
  assert.equal(isValidShopItemSpriteKey("color", "gold"), true);
  assert.equal(isValidShopItemSpriteKey("hat", "gold"), false);
});
