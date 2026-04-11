import assert from "node:assert/strict";
import test from "node:test";

import type { TranslationKey } from "@/i18n";
import type { AdminSecretProduct } from "@/lib/shop-client";

import {
  applyPurchasePolicyToDraft,
  applyProviderPresetToDraft,
  buildAdminSecretProductCreateInputFromDraft,
  buildAdminSecretProductUpdateInput,
  buildAdminSecretProductUpdateInputFromDraft,
  createInitialProductDraft,
  createProductDraftFromProduct,
  formatApiQuotaProductPreview,
  getPurchasePolicyConfig,
  getPurchasePolicyLabel,
} from "./api-quota-product-draft";

function createProduct(overrides: Record<string, unknown> = {}): AdminSecretProduct {
  return {
    id: "product-1",
    name: "Provider Quota Pack",
    description: "10k tokens",
    productType: "API_QUOTA",
    price: 300,
    currencyType: "POINTS",
    isActive: true,
    displayConfig: {
      providerLabel: "Provider",
      usageInstructions: "Store securely",
      quotaUnitLabel: "tokens",
    },
    fulfillmentConfig: {
      quotaAmount: 10000,
      allowRepeatPurchase: true,
      perAgentPurchaseLimit: null,
    },
    inventoryCount: 0,
    orderCount: 1,
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-02T00:00:00.000Z",
    ...overrides,
  };
}

function createTranslator() {
  return (key: TranslationKey, params?: Record<string, string | number>) => {
    switch (key) {
      case "admin.products.policy.repeat":
        return "Repeat purchase";
      case "admin.products.policy.single":
        return "One per agent";
      case "admin.products.policy.limited":
        return `Up to ${params?.count} per agent`;
      case "common.pts":
        return "pts";
      default:
        return key;
    }
  };
}

test("createInitialProductDraft defaults to the OpenAI preset and repeat policy", () => {
  const draft = createInitialProductDraft();

  assert.equal(draft.providerPresetId, "openai");
  assert.equal(draft.providerLabel, "OpenAI");
  assert.equal(draft.quotaAmount, 10000);
  assert.equal(draft.quotaUnitLabel, "tokens");
  assert.equal(draft.purchasePolicy, "repeat");
  assert.equal(draft.perAgentPurchaseLimit, null);
});

test("applyProviderPresetToDraft swaps provider defaults while preserving typed fields", () => {
  const draft = applyProviderPresetToDraft(
    {
      ...createInitialProductDraft(),
      name: "Premium Pack",
      description: "Launch promo",
      price: 480,
    },
    "anthropic"
  );

  assert.equal(draft.providerPresetId, "anthropic");
  assert.equal(draft.providerLabel, "Anthropic");
  assert.equal(draft.quotaUnitLabel, "tokens");
  assert.equal(draft.name, "Premium Pack");
  assert.equal(draft.description, "Launch promo");
  assert.equal(draft.price, 480);
});

test("createProductDraftFromProduct derives preset and purchase policy for editing", () => {
  const singleDraft = createProductDraftFromProduct(
    createProduct({
      displayConfig: {
        providerLabel: "OpenAI",
        usageInstructions: "Bring your own key",
        quotaUnitLabel: "tokens",
      },
      fulfillmentConfig: {
        quotaAmount: 24000,
        allowRepeatPurchase: false,
        perAgentPurchaseLimit: null,
      },
    })
  );

  assert.equal(singleDraft.providerPresetId, "openai");
  assert.equal(singleDraft.purchasePolicy, "single");
  assert.equal(singleDraft.perAgentPurchaseLimit, 1);

  const limitedDraft = createProductDraftFromProduct(
    createProduct({
      displayConfig: {
        providerLabel: "Anthropic",
        usageInstructions: "Internal",
        quotaUnitLabel: "tokens",
      },
      fulfillmentConfig: {
        quotaAmount: 50000,
        allowRepeatPurchase: true,
        perAgentPurchaseLimit: 2,
      },
    })
  );

  assert.equal(limitedDraft.providerPresetId, "anthropic");
  assert.equal(limitedDraft.purchasePolicy, "limited");
  assert.equal(limitedDraft.perAgentPurchaseLimit, 2);
});

test("getPurchasePolicyConfig maps purchase policies to the existing API payload shape", () => {
  assert.deepEqual(getPurchasePolicyConfig("repeat", null), {
    allowRepeatPurchase: true,
    perAgentPurchaseLimit: null,
    error: null,
  });
  assert.deepEqual(getPurchasePolicyConfig("single", null), {
    allowRepeatPurchase: false,
    perAgentPurchaseLimit: 1,
    error: null,
  });
  assert.deepEqual(getPurchasePolicyConfig("limited", 3), {
    allowRepeatPurchase: true,
    perAgentPurchaseLimit: 3,
    error: null,
  });
  assert.deepEqual(getPurchasePolicyConfig("limited", 0), {
    allowRepeatPurchase: true,
    perAgentPurchaseLimit: null,
    error: "admin.products.form.perAgentPurchaseLimitInvalid",
  });
});

test("getPurchasePolicyLabel and preview formatting reuse the derived purchase policy", () => {
  const t = createTranslator();

  assert.equal(getPurchasePolicyLabel(t, "repeat", null), "Repeat purchase");
  assert.equal(getPurchasePolicyLabel(t, "single", 1), "One per agent");
  assert.equal(getPurchasePolicyLabel(t, "limited", 4), "Up to 4 per agent");

  assert.deepEqual(
    formatApiQuotaProductPreview(t, {
      ...createInitialProductDraft(),
      name: "OpenAI Boost",
      price: 300,
      quotaAmount: 20000,
    }),
    {
      provider: "OpenAI",
      name: "OpenAI Boost",
      quota: "20000 tokens",
      policy: "Repeat purchase",
      price: "300 pts",
    }
  );
});

test("draft payload builders derive allowRepeatPurchase and perAgentPurchaseLimit", () => {
  const createInput = buildAdminSecretProductCreateInputFromDraft({
    ...createInitialProductDraft(),
    name: "Solo Pack",
    description: "One purchase per agent",
    price: 150,
    purchasePolicy: "single",
  });

  assert.equal(createInput.allowRepeatPurchase, false);
  assert.equal(createInput.perAgentPurchaseLimit, 1);

  const updateInput = buildAdminSecretProductUpdateInputFromDraft({
    draft: {
      ...createInitialProductDraft(),
      name: "Team Pack",
      description: "Shared budget",
      price: 640,
      purchasePolicy: "limited",
      perAgentPurchaseLimit: 5,
    },
    isActive: false,
  });

  assert.equal(updateInput.allowRepeatPurchase, true);
  assert.equal(updateInput.perAgentPurchaseLimit, 5);
  assert.equal(updateInput.isActive, false);
});

test("provider preset and purchase policy changes flow into the derived create payload", () => {
  const draft = applyPurchasePolicyToDraft(
    applyProviderPresetToDraft(createInitialProductDraft(), "anthropic"),
    "single"
  );

  const input = buildAdminSecretProductCreateInputFromDraft({
    ...draft,
    name: "Anthropic Solo Pack",
    description: "One purchase per agent",
  });

  assert.equal(input.providerLabel, "Anthropic");
  assert.equal(input.quotaUnitLabel, "tokens");
  assert.equal(input.allowRepeatPurchase, false);
  assert.equal(input.perAgentPurchaseLimit, 1);
});

test("buildAdminSecretProductUpdateInput keeps latest product values for activation toggles", () => {
  const product = createProduct({
    displayConfig: {
      providerLabel: "Anthropic",
      usageInstructions: "Keep internal",
      quotaUnitLabel: "tokens",
    },
    fulfillmentConfig: {
      quotaAmount: 32000,
      allowRepeatPurchase: true,
      perAgentPurchaseLimit: 2,
    },
  });

  const input = buildAdminSecretProductUpdateInput({
    product,
    isActive: false,
  });

  assert.equal(input.name, "Provider Quota Pack");
  assert.equal(input.providerLabel, "Anthropic");
  assert.equal(input.usageInstructions, "Keep internal");
  assert.equal(input.quotaAmount, 32000);
  assert.equal(input.allowRepeatPurchase, true);
  assert.equal(input.perAgentPurchaseLimit, 2);
  assert.equal(input.isActive, false);
});

test("buildAdminSecretProductUpdateInput preserves stored single-purchase semantics on activation toggles", () => {
  const product = createProduct({
    displayConfig: {
      providerLabel: "OpenAI",
      usageInstructions: "One-time only",
      quotaUnitLabel: "tokens",
    },
    fulfillmentConfig: {
      quotaAmount: 16000,
      allowRepeatPurchase: false,
      perAgentPurchaseLimit: null,
    },
  });

  const input = buildAdminSecretProductUpdateInput({
    product,
    isActive: false,
  });

  assert.equal(input.allowRepeatPurchase, false);
  assert.equal(input.perAgentPurchaseLimit, null);
  assert.equal(input.isActive, false);
});
