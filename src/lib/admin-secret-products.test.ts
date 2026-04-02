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

test("parseAdminSecretProductInput rejects non-object displayConfig", () => {
  assert.throws(
    () =>
      parseAdminSecretProductInput({
        name: "API Key",
        description: "",
        productType: "SECRET_CREDENTIAL",
        price: 150,
        isActive: true,
        displayConfig: ["Acme"],
        fulfillmentConfig: {
          repeatPurchasePolicy: "ALLOW",
        },
      }),
    /displayConfig/
  );
});

test("parseAdminSecretProductInput rejects non-object fulfillmentConfig", () => {
  assert.throws(
    () =>
      parseAdminSecretProductInput({
        name: "API Key",
        description: "",
        productType: "SECRET_CREDENTIAL",
        price: 150,
        isActive: true,
        displayConfig: {
          providerLabel: "Acme",
          usageInstructions: "Use as directed",
        },
        fulfillmentConfig: ["ALLOW"],
      }),
    /fulfillmentConfig/
  );
});

test("parseAdminSecretProductInput rejects missing displayConfig fields", () => {
  assert.throws(
    () =>
      parseAdminSecretProductInput({
        name: "API Key",
        description: "",
        productType: "SECRET_CREDENTIAL",
        price: 150,
        isActive: true,
        displayConfig: {
          providerLabel: "",
          usageInstructions: "Use as directed",
        },
        fulfillmentConfig: {
          repeatPurchasePolicy: "ALLOW",
        },
      }),
    /providerLabel/
  );
});

test("parseAdminSecretProductInput rejects missing fulfillmentConfig fields", () => {
  assert.throws(
    () =>
      parseAdminSecretProductInput({
        name: "API Key",
        description: "",
        productType: "SECRET_CREDENTIAL",
        price: 150,
        isActive: true,
        displayConfig: {
          providerLabel: "Acme",
          usageInstructions: "Use as directed",
        },
        fulfillmentConfig: {
          repeatPurchasePolicy: "",
        },
      }),
    /repeatPurchasePolicy/
  );
});

test("parseAdminSecretProductInput rejects invalid perAgentPurchaseLimit", () => {
  assert.throws(
    () =>
      parseAdminSecretProductInput({
        name: "API Key",
        description: "",
        productType: "SECRET_CREDENTIAL",
        price: 150,
        isActive: true,
        displayConfig: {
          providerLabel: "Acme",
          usageInstructions: "Use as directed",
        },
        fulfillmentConfig: {
          repeatPurchasePolicy: "ALLOW",
          perAgentPurchaseLimit: 0,
        },
      }),
    /perAgentPurchaseLimit/
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
