import type { TranslationKey } from "@/i18n";
import type {
  AdminSecretProduct,
  AdminSecretProductCreateInput,
  AdminSecretProductUpdateInput,
} from "@/lib/shop-client";

export type ApiQuotaProductPurchasePolicy = "repeat" | "single" | "limited";

export type ApiQuotaProductDraft = {
  name: string;
  description: string;
  price: number;
  usageInstructions: string;
  quotaAmount: number;
  quotaUnitLabel: string;
  purchasePolicy: ApiQuotaProductPurchasePolicy;
  perAgentPurchaseLimit: number | null;
};

type PurchasePolicyConfig = {
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit: number | null;
  error: TranslationKey | null;
};

function getUsageInstructions(product: AdminSecretProduct) {
  return typeof product.displayConfig.usageInstructions === "string"
    ? product.displayConfig.usageInstructions
    : "";
}

function getQuotaUnitLabel(product: AdminSecretProduct) {
  return typeof product.displayConfig.quotaUnitLabel === "string"
    ? product.displayConfig.quotaUnitLabel
    : "tokens";
}

function getQuotaAmount(product: AdminSecretProduct) {
  return typeof product.fulfillmentConfig.quotaAmount === "number"
    ? product.fulfillmentConfig.quotaAmount
    : 0;
}

function getPerAgentPurchaseLimit(product: AdminSecretProduct) {
  return typeof product.fulfillmentConfig.perAgentPurchaseLimit === "number"
    ? product.fulfillmentConfig.perAgentPurchaseLimit
    : null;
}

function getAllowRepeatPurchase(product: AdminSecretProduct) {
  return typeof product.fulfillmentConfig.allowRepeatPurchase === "boolean"
    ? product.fulfillmentConfig.allowRepeatPurchase
    : true;
}

function getPurchasePolicyFromProduct(
  product: AdminSecretProduct
): ApiQuotaProductPurchasePolicy {
  if (!getAllowRepeatPurchase(product)) {
    return "single";
  }

  return getPerAgentPurchaseLimit(product) === null ? "repeat" : "limited";
}

function formatQuota(quotaAmount: number, quotaUnitLabel: string) {
  return `${quotaAmount} ${quotaUnitLabel}`;
}

function assertValidPurchasePolicyConfig(config: PurchasePolicyConfig) {
  if (config.error) {
    throw new Error(config.error);
  }

  return config;
}

export function createInitialProductDraft(): ApiQuotaProductDraft {
  return {
    name: "",
    description: "",
    price: 0,
    usageInstructions: "",
    quotaAmount: 10000,
    quotaUnitLabel: "tokens",
    purchasePolicy: "repeat",
    perAgentPurchaseLimit: null,
  };
}

export function applyPurchasePolicyToDraft(
  draft: ApiQuotaProductDraft,
  purchasePolicy: ApiQuotaProductPurchasePolicy
): ApiQuotaProductDraft {
  if (purchasePolicy === "repeat") {
    return {
      ...draft,
      purchasePolicy,
      perAgentPurchaseLimit: null,
    };
  }

  if (purchasePolicy === "single") {
    return {
      ...draft,
      purchasePolicy,
      perAgentPurchaseLimit: 1,
    };
  }

  return {
    ...draft,
    purchasePolicy,
    perAgentPurchaseLimit:
      typeof draft.perAgentPurchaseLimit === "number" && draft.perAgentPurchaseLimit > 0
        ? draft.perAgentPurchaseLimit
        : 1,
  };
}

export function createProductDraftFromProduct(
  product: AdminSecretProduct
): ApiQuotaProductDraft {
  const purchasePolicy = getPurchasePolicyFromProduct(product);
  const perAgentPurchaseLimit = getPerAgentPurchaseLimit(product);

  return {
    name: product.name,
    description: product.description,
    price: product.price,
    usageInstructions: getUsageInstructions(product),
    quotaAmount: getQuotaAmount(product),
    quotaUnitLabel: getQuotaUnitLabel(product),
    purchasePolicy,
    perAgentPurchaseLimit:
      purchasePolicy === "single" ? 1 : purchasePolicy === "limited" ? perAgentPurchaseLimit : null,
  };
}

export function getPurchasePolicyConfig(
  purchasePolicy: ApiQuotaProductPurchasePolicy,
  perAgentPurchaseLimit: number | null
): PurchasePolicyConfig {
  if (purchasePolicy === "repeat") {
    return {
      allowRepeatPurchase: true,
      perAgentPurchaseLimit: null,
      error: null,
    };
  }

  if (purchasePolicy === "single") {
    return {
      allowRepeatPurchase: false,
      perAgentPurchaseLimit: 1,
      error: null,
    };
  }

  if (
    typeof perAgentPurchaseLimit !== "number" ||
    !Number.isInteger(perAgentPurchaseLimit) ||
    perAgentPurchaseLimit < 1
  ) {
    return {
      allowRepeatPurchase: true,
      perAgentPurchaseLimit: null,
      error: "admin.products.form.perAgentPurchaseLimitInvalid",
    };
  }

  return {
    allowRepeatPurchase: true,
    perAgentPurchaseLimit,
    error: null,
  };
}

export function getPurchasePolicyLabel(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  purchasePolicy: ApiQuotaProductPurchasePolicy,
  perAgentPurchaseLimit: number | null
) {
  if (purchasePolicy === "repeat") {
    return t("admin.products.policy.repeat");
  }

  if (purchasePolicy === "single") {
    return t("admin.products.policy.single");
  }

  return t("admin.products.policy.limited", {
    count: perAgentPurchaseLimit ?? 1,
  });
}

export function formatApiQuotaProductPreview(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  draft: ApiQuotaProductDraft
) {
  return {
    name: draft.name || "—",
    quota: formatQuota(draft.quotaAmount, draft.quotaUnitLabel),
    policy: getPurchasePolicyLabel(t, draft.purchasePolicy, draft.perAgentPurchaseLimit),
    price: `${draft.price} ${t("common.pts")}`,
  };
}

export function buildAdminSecretProductCreateInputFromDraft(
  draft: ApiQuotaProductDraft
): AdminSecretProductCreateInput {
  const purchasePolicyConfig = assertValidPurchasePolicyConfig(
    getPurchasePolicyConfig(draft.purchasePolicy, draft.perAgentPurchaseLimit)
  );

  return {
    name: draft.name,
    description: draft.description,
    price: draft.price,
    usageInstructions: draft.usageInstructions,
    quotaAmount: draft.quotaAmount,
    quotaUnitLabel: draft.quotaUnitLabel,
    allowRepeatPurchase: purchasePolicyConfig.allowRepeatPurchase,
    perAgentPurchaseLimit: purchasePolicyConfig.perAgentPurchaseLimit,
  };
}

export function buildAdminSecretProductUpdateInputFromDraft({
  draft,
  isActive,
}: {
  draft: ApiQuotaProductDraft;
  isActive: boolean;
}): AdminSecretProductUpdateInput {
  return {
    ...buildAdminSecretProductCreateInputFromDraft(draft),
    isActive,
  };
}

export function buildAdminSecretProductUpdateInput({
  product,
  isActive,
}: {
  product: AdminSecretProduct;
  isActive: boolean;
}): AdminSecretProductUpdateInput {
  return {
    name: product.name,
    description: product.description,
    price: product.price,
    providerLabel:
      typeof product.displayConfig.providerLabel === "string"
        ? product.displayConfig.providerLabel
        : null,
    usageInstructions: getUsageInstructions(product),
    quotaAmount: getQuotaAmount(product),
    quotaUnitLabel: getQuotaUnitLabel(product),
    allowRepeatPurchase: getAllowRepeatPurchase(product),
    perAgentPurchaseLimit: getPerAgentPurchaseLimit(product),
    isActive,
  };
}
