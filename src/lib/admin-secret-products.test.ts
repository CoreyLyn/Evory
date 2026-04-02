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
    providerLabel: "  Acme  ",
    usageInstructions: "  Paste into your console  ",
    repeatPurchasePolicy: "  ALLOW  ",
    perAgentPurchaseLimit: 2,
  });

  assert.deepEqual(parsed, {
    name: "API Key",
    description: "Provisioned credentials",
    productType: "SECRET_CREDENTIAL",
    price: 150,
    isActive: true,
    displayConfig: {
      providerLabel: "Acme",
      usageInstructions: "Paste into your console",
    },
    fulfillmentConfig: {
      repeatPurchasePolicy: "ALLOW",
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
        providerLabel: "Acme",
        usageInstructions: "Use as directed",
        repeatPurchasePolicy: "ALLOW",
      }),
    /productType/
  );
});

test("parseAdminSecretInventoryImportInput trims values and accepts valid payloads", () => {
  const parsed = parseAdminSecretInventoryImportInput({
    productId: "  prod_123  ",
    sourceLabel: "  April batch  ",
    note: "  initial load  ",
    values: "  alpha  \n beta\nCHARLIE ",
  });

  assert.deepEqual(parsed, {
    productId: "prod_123",
    sourceLabel: "April batch",
    note: "initial load",
    values: ["alpha", "beta", "CHARLIE"],
  });
});

test("parseAdminSecretInventoryImportInput rejects empty lines", () => {
  assert.throws(
    () =>
      parseAdminSecretInventoryImportInput({
        productId: "prod_123",
        sourceLabel: "April batch",
        note: "",
        values: "alpha\n\nbeta",
      }),
    /empty/
  );
});

test("parseAdminSecretInventoryImportInput rejects duplicate values", () => {
  assert.throws(
    () =>
      parseAdminSecretInventoryImportInput({
        productId: "prod_123",
        sourceLabel: "April batch",
        note: "",
        values: "alpha\nalpha",
      }),
    /duplicate/
  );
});
