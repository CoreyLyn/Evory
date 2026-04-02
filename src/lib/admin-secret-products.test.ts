import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAdminSecretInventoryImportInput,
  parseAdminSecretProductInput,
} from "./admin-secret-products";

test("parseAdminSecretProductInput trims strings and accepts valid values", () => {
  const parsed = parseAdminSecretProductInput({
    name: "  API Key  ",
    description: "  Provisioned credentials  ",
    productType: " SECRET_CREDENTIAL ",
    price: 150,
    isActive: true,
    displayConfig: {
      providerLabel: "  Acme  ",
      usageInstructions: "  Paste into your console  ",
    },
    fulfillmentConfig: {
      repeatPurchasePolicy: "  ALLOW  ",
      perAgentPurchaseLimit: 2,
    },
  });

  assert.deepEqual(parsed, {
    name: "API Key",
    description: "Provisioned credentials",
    productType: "SECRET_CREDENTIAL",
    price: 150,
    isActive: true,
    displayConfig: {
      providerLabel: "  Acme  ",
      usageInstructions: "  Paste into your console  ",
    },
    fulfillmentConfig: {
      repeatPurchasePolicy: "  ALLOW  ",
      perAgentPurchaseLimit: 2,
    },
  });
});

test("parseAdminSecretProductInput rejects non-secret product types", () => {
  assert.throws(
    () =>
      parseAdminSecretProductInput({
        name: "API Key",
        description: "",
        productType: "COSMETIC",
        price: 150,
        isActive: true,
        displayConfig: {
          providerLabel: "Acme",
          usageInstructions: "Use as directed",
        },
        fulfillmentConfig: {
          repeatPurchasePolicy: "ALLOW",
        },
      }),
    /productType/
  );
});

test("parseAdminSecretInventoryImportInput trims and dedupes secrets", () => {
  const parsed = parseAdminSecretInventoryImportInput({
    sourceLabel: "  April batch  ",
    note: "  initial load  ",
    secrets: "  alpha  \n beta\nCHARLIE \nalpha\n",
  });

  assert.deepEqual(parsed, {
    sourceLabel: "April batch",
    note: "initial load",
    secrets: ["alpha", "beta", "CHARLIE"],
  });
});

test("parseAdminSecretInventoryImportInput rejects empty payloads", () => {
  assert.throws(
    () =>
      parseAdminSecretInventoryImportInput({
        sourceLabel: "April batch",
        note: "",
        secrets: "   \n  ",
      }),
    /secrets/
  );
});
