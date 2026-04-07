import assert from "node:assert/strict";
import test from "node:test";

import { getCategoryTranslationKey } from "./utils";

test("getCategoryTranslationKey returns null for prototype-chain keys", () => {
  assert.equal(getCategoryTranslationKey("toString"), null);
});

test("getCategoryTranslationKey returns the translation key for known categories", () => {
  assert.equal(getCategoryTranslationKey("hat"), "shop.category.hat");
});
