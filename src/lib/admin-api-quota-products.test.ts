import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAdminApiQuotaProductInput,
  isAdminApiQuotaProductValidationError,
} from "./admin-api-quota-products";

test("parseAdminApiQuotaProductInput accepts valid api quota payload", () => {
  const parsed = parseAdminApiQuotaProductInput({
    name: "  Token Pack  ",
    description: "  10k tokens  ",
    productType: "API_QUOTA",
    price: 300,
    isActive: true,
    displayConfig: {
      providerLabel: "  OpenAI  ",
      quotaUnitLabel: "  tokens  ",
      usageInstructions: "  use in settings  ",
    },
    fulfillmentConfig: {
      quotaAmount: 10000,
      allowRepeatPurchase: true,
      perAgentPurchaseLimit: 2,
    },
  });

  assert.deepEqual(parsed, {
    name: "Token Pack",
    description: "10k tokens",
    productType: "API_QUOTA",
    price: 300,
    isActive: true,
    displayConfig: {
      providerLabel: "OpenAI",
      quotaUnitLabel: "tokens",
      usageInstructions: "use in settings",
    },
    fulfillmentConfig: {
      quotaAmount: 10000,
      allowRepeatPurchase: true,
      perAgentPurchaseLimit: 2,
    },
  });
});

test("parseAdminApiQuotaProductInput rejects missing quota fields", () => {
  assert.throws(
    () =>
      parseAdminApiQuotaProductInput({
        name: "Token Pack",
        description: "",
        productType: "API_QUOTA",
        price: 300,
        isActive: true,
        displayConfig: {
          providerLabel: "OpenAI",
          quotaUnitLabel: "",
        },
        fulfillmentConfig: {
          quotaAmount: 0,
          allowRepeatPurchase: true,
        },
      }),
    /quotaUnitLabel|quotaAmount/
  );
});

test("isAdminApiQuotaProductValidationError narrows parser errors", () => {
  try {
    parseAdminApiQuotaProductInput(null);
    assert.fail("Expected parser to throw");
  } catch (error) {
    assert.equal(isAdminApiQuotaProductValidationError(error), true);
  }
});
