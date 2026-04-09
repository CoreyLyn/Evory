"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { TranslationKey } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createAdminProvidedApiKey,
  createAdminSecretProduct,
  fetchAdminApiKeyApplications,
  fetchAdminProvidedApiKeys,
  fetchAdminSecretProductOrders,
  fetchAdminSecretProducts,
  fulfillAdminApiKeyApplication,
  fulfillAdminQuotaOrder,
  type AdminApiKeyApplication,
  type AdminApiKeyApplicationStatus,
  type AdminProvidedApiKey,
  type AdminSecretProduct,
  type AdminSecretProductOrder,
  type AdminSecretProductUpdateInput,
  type SecretProductOrderStatus,
  updateAdminProvidedApiKey,
  updateAdminSecretProduct,
} from "@/lib/shop-client";

type MutationResponse = {
  success: boolean;
  error?: string;
};

type ProductDraft = {
  name: string;
  description: string;
  price: number;
  providerLabel: string;
  usageInstructions: string;
  quotaAmount: number;
  quotaUnitLabel: string;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimitMode: "unlimited" | "limited";
  perAgentPurchaseLimit: number | null;
};

type ApiKeyDraft = {
  label: string;
  providerLabel: string;
  apiKey: string;
  isActive: boolean;
};

export function createInitialProductDraft(): ProductDraft {
  return {
    name: "",
    description: "",
    price: 0,
    providerLabel: "",
    usageInstructions: "",
    quotaAmount: 10000,
    quotaUnitLabel: "tokens",
    allowRepeatPurchase: true,
    perAgentPurchaseLimitMode: "unlimited",
    perAgentPurchaseLimit: null,
  };
}

function createInitialApiKeyDraft(): ApiKeyDraft {
  return {
    label: "",
    providerLabel: "",
    apiKey: "",
    isActive: true,
  };
}

function getProviderLabel(product: AdminSecretProduct) {
  return typeof product.displayConfig.providerLabel === "string"
    ? product.displayConfig.providerLabel
    : "";
}

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

export function getEffectiveAllowRepeatPurchase(product: AdminSecretProduct) {
  return typeof product.fulfillmentConfig.allowRepeatPurchase === "boolean"
    ? product.fulfillmentConfig.allowRepeatPurchase
    : true;
}

export function createProductDraftFromProduct(
  product: AdminSecretProduct
): ProductDraft {
  const perAgentPurchaseLimit = getPerAgentPurchaseLimit(product);

  return {
    name: product.name,
    description: product.description,
    price: product.price,
    providerLabel: getProviderLabel(product),
    usageInstructions: getUsageInstructions(product),
    quotaAmount: getQuotaAmount(product),
    quotaUnitLabel: getQuotaUnitLabel(product),
    allowRepeatPurchase: getEffectiveAllowRepeatPurchase(product),
    perAgentPurchaseLimitMode: perAgentPurchaseLimit === null ? "unlimited" : "limited",
    perAgentPurchaseLimit,
  };
}

export function buildAdminSecretProductUpdateInput({
  product,
  allowRepeatPurchase,
  perAgentPurchaseLimit,
  isActive,
  overrides,
}: {
  product: AdminSecretProduct;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit: number | null;
  isActive: boolean;
  overrides?: Partial<
    Pick<
      AdminSecretProductUpdateInput,
      | "name"
      | "description"
      | "price"
      | "quotaAmount"
      | "quotaUnitLabel"
      | "providerLabel"
      | "usageInstructions"
    >
  >;
}): AdminSecretProductUpdateInput {
  return {
    name: overrides?.name ?? product.name,
    description: overrides?.description ?? product.description,
    price: overrides?.price ?? product.price,
    providerLabel: overrides?.providerLabel ?? getProviderLabel(product),
    usageInstructions: overrides?.usageInstructions ?? getUsageInstructions(product),
    quotaAmount: overrides?.quotaAmount ?? getQuotaAmount(product),
    quotaUnitLabel: overrides?.quotaUnitLabel ?? getQuotaUnitLabel(product),
    allowRepeatPurchase,
    perAgentPurchaseLimit,
    isActive,
  };
}

export function buildAdminSecretProductUpdateInputFromDraft({
  draft,
  perAgentPurchaseLimit,
  isActive,
}: {
  draft: ProductDraft;
  perAgentPurchaseLimit: number | null;
  isActive: boolean;
}): AdminSecretProductUpdateInput {
  return {
    name: draft.name,
    description: draft.description,
    price: draft.price,
    providerLabel: draft.providerLabel,
    usageInstructions: draft.usageInstructions,
    quotaAmount: draft.quotaAmount,
    quotaUnitLabel: draft.quotaUnitLabel,
    allowRepeatPurchase: draft.allowRepeatPurchase,
    perAgentPurchaseLimit,
    isActive,
  };
}

export function resolvePerAgentPurchaseLimit(
  mode: ProductDraft["perAgentPurchaseLimitMode"],
  value: ProductDraft["perAgentPurchaseLimit"]
) {
  if (mode === "unlimited") {
    return { value: null, error: null as TranslationKey | null };
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return {
      value: null,
      error: "admin.products.form.perAgentPurchaseLimitInvalid" as TranslationKey,
    };
  }

  return { value, error: null as TranslationKey | null };
}

export function normalizeInventoryProductId(
  products: AdminSecretProduct[],
  productId: string
) {
  if (products.length === 0) {
    return "";
  }

  if (products.some((product) => product.id === productId)) {
    return productId;
  }

  return products[0].id;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function getOrderStatusLabel(
  status: SecretProductOrderStatus,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
) {
  switch (status) {
    case "PENDING":
      return t("admin.products.orders.status.pending");
    case "FAILED":
      return t("admin.products.orders.status.failed");
    case "FULFILLED":
    default:
      return t("admin.products.orders.status.fulfilled");
  }
}

function getApplicationStatusLabel(
  status: AdminApiKeyApplicationStatus,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
) {
  switch (status) {
    case "PENDING":
      return t("admin.products.applications.status.pending");
    case "FAILED":
      return t("admin.products.applications.status.failed");
    case "FULFILLED":
    default:
      return t("admin.products.applications.status.fulfilled");
  }
}

export async function performAdminSecretProductMutation({
  request,
  onRefresh,
  onError,
  onSuccess,
  successMessage,
  errorFallback,
}: {
  request: () => Promise<MutationResponse>;
  onRefresh: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
  successMessage: string;
  errorFallback: string;
}): Promise<boolean> {
  const json = await request();

  if (!json.success) {
    onError(json.error || errorFallback);
    return false;
  }

  onSuccess(successMessage);
  await onRefresh();
  return true;
}

export function AdminSecretProductsPanel({
  t,
  products,
  loading,
  onRefresh,
  onError,
  onSuccess,
}: {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  products: AdminSecretProduct[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
}) {
  const [productDraft, setProductDraft] = useState<ProductDraft>(() =>
    createInitialProductDraft()
  );
  const [apiKeyDraft, setApiKeyDraft] = useState<ApiKeyDraft>(() => createInitialApiKeyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submittingProduct, setSubmittingProduct] = useState(false);
  const [submittingKey, setSubmittingKey] = useState(false);
  const [actionProductId, setActionProductId] = useState<string | null>(null);
  const [apiKeyActionId, setApiKeyActionId] = useState<string | null>(null);
  const [fulfillingOrderId, setFulfillingOrderId] = useState<string | null>(null);
  const [fulfillingApplicationId, setFulfillingApplicationId] = useState<string | null>(
    null
  );
  const [apiKeys, setApiKeys] = useState<AdminProvidedApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [orderRows, setOrderRows] = useState<AdminSecretProductOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [applications, setApplications] = useState<AdminApiKeyApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [selectedKeyByApplication, setSelectedKeyByApplication] = useState<
    Record<string, string>
  >({});

  const activeProducts = products.filter((product) => product.isActive);
  const inactiveProducts = products.filter((product) => !product.isActive);
  const activeApiKeys = apiKeys.filter((key) => key.isActive);

  async function refreshApiKeys() {
    setApiKeysLoading(true);
    try {
      const data = await fetchAdminProvidedApiKeys(fetch);
      setApiKeys(data);
    } catch (error) {
      onError(getErrorMessage(error, t("admin.actionFailed")));
      setApiKeys([]);
    } finally {
      setApiKeysLoading(false);
    }
  }

  async function refreshOrders() {
    setOrdersLoading(true);
    try {
      const data = await fetchAdminSecretProductOrders(fetch, {
        status: "PENDING",
      });
      setOrderRows(data);
    } catch (error) {
      onError(getErrorMessage(error, t("admin.actionFailed")));
      setOrderRows([]);
    } finally {
      setOrdersLoading(false);
    }
  }

  async function refreshApplications() {
    setApplicationsLoading(true);
    try {
      const data = await fetchAdminApiKeyApplications(fetch);
      setApplications(data);
      setSelectedKeyByApplication((current) => {
        const next = { ...current };
        const fallbackKeyId = activeApiKeys[0]?.id ?? "";

        for (const application of data) {
          if (application.status !== "PENDING") {
            continue;
          }
          if (!next[application.id] && fallbackKeyId) {
            next[application.id] = fallbackKeyId;
          }
        }

        return next;
      });
    } catch (error) {
      onError(getErrorMessage(error, t("admin.actionFailed")));
      setApplications([]);
    } finally {
      setApplicationsLoading(false);
    }
  }

  useEffect(() => {
    void refreshApiKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeApiKeys[0]?.id) {
      return;
    }

    setSelectedKeyByApplication((current) => {
      const next = { ...current };
      let changed = false;

      for (const application of applications) {
        if (application.status !== "PENDING") {
          continue;
        }
        if (!next[application.id]) {
          next[application.id] = activeApiKeys[0].id;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [activeApiKeys, applications]);

  function resetProductDraft() {
    setProductDraft(createInitialProductDraft());
    setEditingId(null);
  }

  function startEdit(product: AdminSecretProduct) {
    setEditingId(product.id);
    setProductDraft(createProductDraftFromProduct(product));
  }

  async function handleSubmitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmittingProduct(true);
    onError(null);
    onSuccess(null);

    const limitResolution = resolvePerAgentPurchaseLimit(
      productDraft.perAgentPurchaseLimitMode,
      productDraft.perAgentPurchaseLimit
    );

    if (limitResolution.error) {
      onError(t(limitResolution.error));
      setSubmittingProduct(false);
      return;
    }

    const editingProduct = editingId
      ? products.find((product) => product.id === editingId)
      : null;

    if (editingId && !editingProduct) {
      onError(t("admin.products.editMissing"));
      setSubmittingProduct(false);
      return;
    }

    try {
      const didSucceed = await performAdminSecretProductMutation({
        request: async () => {
          if (editingId && editingProduct) {
            const latestProducts = await fetchAdminSecretProducts(fetch);
            const latestProduct = latestProducts.find((product) => product.id === editingId);

            if (!latestProduct) {
              return { success: false, error: t("admin.products.editMissing") };
            }

            await updateAdminSecretProduct(
              fetch,
              editingId,
              buildAdminSecretProductUpdateInputFromDraft({
                draft: productDraft,
                perAgentPurchaseLimit: limitResolution.value,
                isActive: latestProduct.isActive,
              })
            );
          } else {
            await createAdminSecretProduct(fetch, {
              name: productDraft.name,
              description: productDraft.description,
              price: productDraft.price,
              providerLabel: productDraft.providerLabel,
              usageInstructions: productDraft.usageInstructions,
              quotaAmount: productDraft.quotaAmount,
              quotaUnitLabel: productDraft.quotaUnitLabel,
              allowRepeatPurchase: productDraft.allowRepeatPurchase,
              perAgentPurchaseLimit: limitResolution.value,
            });
          }

          return { success: true };
        },
        onRefresh,
        onError,
        onSuccess,
        successMessage: editingId
          ? t("admin.products.updateSuccess")
          : t("admin.products.createSuccess"),
        errorFallback: t("admin.actionFailed"),
      });

      if (didSucceed) {
        resetProductDraft();
      }
    } catch (error) {
      onError(getErrorMessage(error, t("admin.actionFailed")));
    } finally {
      setSubmittingProduct(false);
    }
  }

  async function handleActivation(product: AdminSecretProduct, nextIsActive: boolean) {
    setActionProductId(product.id);
    onError(null);
    onSuccess(null);

    try {
      await performAdminSecretProductMutation({
        request: async () => {
          const latestProducts = await fetchAdminSecretProducts(fetch);
          const latestProduct = latestProducts.find((item) => item.id === product.id);

          if (!latestProduct) {
            return { success: false, error: t("admin.products.editMissing") };
          }

          await updateAdminSecretProduct(
            fetch,
            latestProduct.id,
            buildAdminSecretProductUpdateInput({
              product: latestProduct,
              allowRepeatPurchase: getEffectiveAllowRepeatPurchase(latestProduct),
              perAgentPurchaseLimit: getPerAgentPurchaseLimit(latestProduct),
              isActive: nextIsActive,
            })
          );

          return { success: true };
        },
        onRefresh,
        onError,
        onSuccess,
        successMessage: nextIsActive
          ? t("admin.products.activateSuccess")
          : t("admin.products.deactivateSuccess"),
        errorFallback: t("admin.actionFailed"),
      });
    } catch (error) {
      onError(getErrorMessage(error, t("admin.actionFailed")));
    } finally {
      setActionProductId(null);
    }
  }

  async function handleSubmitApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmittingKey(true);
    onError(null);
    onSuccess(null);

    try {
      await createAdminProvidedApiKey(fetch, apiKeyDraft);
      setApiKeyDraft(createInitialApiKeyDraft());
      await refreshApiKeys();
      await refreshOrders();
      onSuccess(t("admin.products.keys.createSuccess"));
    } catch (error) {
      onError(getErrorMessage(error, t("admin.actionFailed")));
    } finally {
      setSubmittingKey(false);
    }
  }

  async function handleToggleApiKey(key: AdminProvidedApiKey, nextIsActive: boolean) {
    setApiKeyActionId(key.id);
    onError(null);
    onSuccess(null);

    try {
      await updateAdminProvidedApiKey(fetch, key.id, {
        label: key.label,
        providerLabel: key.providerLabel,
        isActive: nextIsActive,
      });
      await refreshApiKeys();
      onSuccess(
        nextIsActive
          ? t("admin.products.keys.activateSuccess")
          : t("admin.products.keys.deactivateSuccess")
      );
    } catch (error) {
      onError(getErrorMessage(error, t("admin.actionFailed")));
    } finally {
      setApiKeyActionId(null);
    }
  }

  async function handleFulfillOrder(order: AdminSecretProductOrder) {
    setFulfillingOrderId(order.id);
    onError(null);
    onSuccess(null);

    try {
      await fulfillAdminQuotaOrder(fetch, order.id);
      await Promise.all([onRefresh(), refreshOrders()]);
      onSuccess(t("admin.products.orders.fulfillSuccess"));
    } catch (error) {
      onError(getErrorMessage(error, t("admin.actionFailed")));
    } finally {
      setFulfillingOrderId(null);
    }
  }

  async function handleFulfillApplication(application: AdminApiKeyApplication) {
    const providedApiKeyId = selectedKeyByApplication[application.id];
    if (!providedApiKeyId) {
      onError(t("admin.products.applications.keyRequired"));
      return;
    }

    setFulfillingApplicationId(application.id);
    onError(null);
    onSuccess(null);

    try {
      await fulfillAdminApiKeyApplication(fetch, application.id, { providedApiKeyId });
      await refreshApplications();
      onSuccess(t("admin.products.applications.fulfillSuccess"));
    } catch (error) {
      onError(getErrorMessage(error, t("admin.actionFailed")));
    } finally {
      setFulfillingApplicationId(null);
    }
  }

  function renderProducts(itemsToRender: AdminSecretProduct[], active: boolean) {
    if (itemsToRender.length === 0) {
      return (
        <Card className="border-dashed border-card-border/40 bg-background/20 p-5">
          <p className="text-sm text-muted">
            {active ? t("admin.products.empty.active") : t("admin.products.empty.inactive")}
          </p>
        </Card>
      );
    }

    return (
      <Card className="overflow-hidden p-0">
        <div className="divide-y divide-card-border/30">
          {itemsToRender.map((product) => {
            const perAgentPurchaseLimit = getPerAgentPurchaseLimit(product);
            const isActionBusy = actionProductId === product.id;

            return (
              <div
                key={product.id}
                className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{product.name}</h3>
                    <Badge variant={product.isActive ? "success" : "muted"}>
                      {product.isActive
                        ? t("admin.products.status.active")
                        : t("admin.products.status.inactive")}
                    </Badge>
                    <Badge
                      variant={getEffectiveAllowRepeatPurchase(product) ? "default" : "muted"}
                    >
                      {getEffectiveAllowRepeatPurchase(product)
                        ? t("admin.products.badge.repeatAllowed")
                        : t("admin.products.badge.repeatBlocked")}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {product.description || t("admin.products.descriptionEmpty")}
                  </p>
                  <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.products.form.providerLabel")}:{" "}
                      </dt>
                      <dd className="inline text-foreground/80">
                        {getProviderLabel(product) || t("admin.products.providerLabelEmpty")}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.products.form.quotaAmount")}:{" "}
                      </dt>
                      <dd className="inline text-foreground/80">{getQuotaAmount(product)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.products.form.quotaUnitLabel")}:{" "}
                      </dt>
                      <dd className="inline text-foreground/80">
                        {getQuotaUnitLabel(product)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.products.orders.count")}:{" "}
                      </dt>
                      <dd className="inline text-foreground/80">{product.orderCount}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.products.form.perAgentPurchaseLimit")}:{" "}
                      </dt>
                      <dd className="inline text-foreground/80">
                        {perAgentPurchaseLimit === null
                          ? t("admin.products.limit.unlimited")
                          : t("admin.products.limit.value", {
                              count: perAgentPurchaseLimit,
                            })}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    disabled={submittingProduct || isActionBusy}
                    onClick={() => startEdit(product)}
                  >
                    {t("admin.products.action.edit")}
                  </Button>
                  <Button
                    type="button"
                    variant={product.isActive ? "danger" : "secondary"}
                    className="px-3 py-1.5 text-xs"
                    disabled={submittingProduct || isActionBusy}
                    onClick={() => void handleActivation(product, !product.isActive)}
                  >
                    {isActionBusy
                      ? product.isActive
                        ? t("admin.products.action.deactivating")
                        : t("admin.products.action.activating")
                      : product.isActive
                        ? t("admin.products.action.deactivate")
                        : t("admin.products.action.activate")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-card-border/50 bg-card/70">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-secondary">
              {t("admin.products.title")}
            </p>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {editingId ? t("admin.products.editTitle") : t("admin.products.createTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted">{t("admin.products.subtitle")}</p>
            </div>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-card-border/40 bg-background/25 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-muted/70">
                {t("admin.products.section.active")}
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {activeProducts.length}
              </div>
            </div>
            <div className="rounded-2xl border border-card-border/40 bg-background/25 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-muted/70">
                {t("admin.products.section.inactive")}
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {inactiveProducts.length}
              </div>
            </div>
          </div>
        </div>

        <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmitProduct}>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.form.name")}
            </span>
            <input
              value={productDraft.name}
              onChange={(event) =>
                setProductDraft((current) => ({ ...current, name: event.target.value }))
              }
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.form.price")}
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={productDraft.price}
              onChange={(event) =>
                setProductDraft((current) => ({
                  ...current,
                  price: Number(event.target.value || 0),
                }))
              }
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.form.description")}
            </span>
            <textarea
              value={productDraft.description}
              onChange={(event) =>
                setProductDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className="min-h-24 w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.form.providerLabel")}
            </span>
            <input
              value={productDraft.providerLabel}
              onChange={(event) =>
                setProductDraft((current) => ({
                  ...current,
                  providerLabel: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.form.quotaAmount")}
            </span>
            <input
              type="number"
              min="1"
              step="1"
              value={productDraft.quotaAmount}
              onChange={(event) =>
                setProductDraft((current) => ({
                  ...current,
                  quotaAmount: Number(event.target.value || 1),
                }))
              }
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.form.quotaUnitLabel")}
            </span>
            <input
              value={productDraft.quotaUnitLabel}
              onChange={(event) =>
                setProductDraft((current) => ({
                  ...current,
                  quotaUnitLabel: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.form.usageInstructions")}
            </span>
            <textarea
              value={productDraft.usageInstructions}
              onChange={(event) =>
                setProductDraft((current) => ({
                  ...current,
                  usageInstructions: event.target.value,
                }))
              }
              className="min-h-24 w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-card-border/40 bg-background/20 px-4 py-3 md:col-span-2">
            <input
              type="checkbox"
              checked={productDraft.allowRepeatPurchase}
              onChange={(event) =>
                setProductDraft((current) => ({
                  ...current,
                  allowRepeatPurchase: event.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-card-border"
            />
            <span className="text-sm text-foreground">
              {t("admin.products.form.allowRepeatPurchase")}
            </span>
          </label>

          <div className="rounded-2xl border border-card-border/40 bg-background/20 px-4 py-3 md:col-span-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-muted">
                {t("admin.products.form.perAgentPurchaseLimit")}
              </span>
              <select
                value={productDraft.perAgentPurchaseLimitMode}
                onChange={(event) =>
                  setProductDraft((current) => {
                    const mode = event.target.value as ProductDraft["perAgentPurchaseLimitMode"];
                    return {
                      ...current,
                      perAgentPurchaseLimitMode: mode,
                      perAgentPurchaseLimit:
                        mode === "unlimited" ? null : current.perAgentPurchaseLimit ?? 1,
                    };
                  })
                }
                className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
              >
                <option value="unlimited">
                  {t("admin.products.form.perAgentPurchaseLimitUnlimited")}
                </option>
                <option value="limited">
                  {t("admin.products.form.perAgentPurchaseLimitLimited")}
                </option>
              </select>
            </label>
            <p className="mt-2 text-xs text-muted">
              {t("admin.products.form.perAgentPurchaseLimitHint")}
            </p>
            {productDraft.perAgentPurchaseLimitMode === "limited" ? (
              <label className="mt-3 block space-y-2">
                <span className="text-xs font-semibold text-muted">
                  {t("admin.products.form.perAgentPurchaseLimitValue")}
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={productDraft.perAgentPurchaseLimit ?? ""}
                  onChange={(event) =>
                    setProductDraft((current) => ({
                      ...current,
                      perAgentPurchaseLimit: event.target.value
                        ? Number(event.target.value)
                        : null,
                    }))
                  }
                  className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
                />
              </label>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-2">
            {editingId ? (
              <Button
                type="button"
                variant="ghost"
                disabled={submittingProduct}
                onClick={resetProductDraft}
              >
                {t("admin.products.action.cancelEdit")}
              </Button>
            ) : null}
            <Button type="submit" disabled={submittingProduct}>
              {submittingProduct
                ? editingId
                  ? t("admin.products.form.submittingUpdate")
                  : t("admin.products.form.submittingCreate")
                : editingId
                  ? t("admin.products.form.submitUpdate")
                  : t("admin.products.form.submitCreate")}
            </Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="border-card-border/50 bg-card/70">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                {t("admin.products.keys.title")}
              </h3>
              <p className="text-sm text-muted">{t("admin.products.keys.subtitle")}</p>
            </div>

            <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmitApiKey}>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-muted">
                  {t("admin.products.keys.form.label")}
                </span>
                <input
                  value={apiKeyDraft.label}
                  onChange={(event) =>
                    setApiKeyDraft((current) => ({ ...current, label: event.target.value }))
                  }
                  className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-muted">
                  {t("admin.products.keys.form.providerLabel")}
                </span>
                <input
                  value={apiKeyDraft.providerLabel}
                  onChange={(event) =>
                    setApiKeyDraft((current) => ({
                      ...current,
                      providerLabel: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-xs font-semibold text-muted">
                  {t("admin.products.keys.form.apiKey")}
                </span>
                <textarea
                  value={apiKeyDraft.apiKey}
                  onChange={(event) =>
                    setApiKeyDraft((current) => ({ ...current, apiKey: event.target.value }))
                  }
                  className="min-h-24 w-full rounded-xl border border-card-border bg-card px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors focus:border-accent/40"
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-card-border/40 bg-background/20 px-4 py-3 md:col-span-2">
                <input
                  type="checkbox"
                  checked={apiKeyDraft.isActive}
                  onChange={(event) =>
                    setApiKeyDraft((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-card-border"
                />
                <span className="text-sm text-foreground">
                  {t("admin.products.keys.form.isActive")}
                </span>
              </label>
              <div className="flex justify-end md:col-span-2">
                <Button type="submit" disabled={submittingKey}>
                  {submittingKey
                    ? t("admin.products.keys.form.submitting")
                    : t("admin.products.keys.form.submit")}
                </Button>
              </div>
            </form>

            <div className="mt-6 space-y-3">
              {apiKeysLoading ? (
                <p className="text-sm text-muted">{t("common.loading")}</p>
              ) : apiKeys.length === 0 ? (
                <p className="text-sm text-muted">{t("admin.products.keys.empty")}</p>
              ) : (
                apiKeys.map((key) => {
                  const isBusy = apiKeyActionId === key.id;
                  return (
                    <div
                      key={key.id}
                      className="rounded-2xl border border-card-border/40 bg-background/20 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-foreground">
                              {key.label}
                            </div>
                            <Badge variant={key.isActive ? "success" : "muted"}>
                              {key.isActive
                                ? t("admin.products.keys.status.active")
                                : t("admin.products.keys.status.inactive")}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted">
                            {key.providerLabel} · {key.maskedKey}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant={key.isActive ? "danger" : "secondary"}
                          className="px-3 py-1.5 text-xs"
                          disabled={isBusy}
                          onClick={() => void handleToggleApiKey(key, !key.isActive)}
                        >
                          {isBusy
                            ? key.isActive
                              ? t("admin.products.keys.action.deactivating")
                              : t("admin.products.keys.action.activating")
                            : key.isActive
                              ? t("admin.products.keys.action.deactivate")
                              : t("admin.products.keys.action.activate")}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="border-card-border/50 bg-card/70">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                {t("admin.products.applications.title")}
              </h3>
              <p className="text-sm text-muted">{t("admin.products.applications.subtitle")}</p>
            </div>

            <div className="mt-6 space-y-3">
              {applicationsLoading ? (
                <p className="text-sm text-muted">{t("common.loading")}</p>
              ) : applications.length === 0 ? (
                <p className="text-sm text-muted">{t("admin.products.applications.empty")}</p>
              ) : (
                applications.map((application) => {
                  const isPending = application.status === "PENDING";
                  const selectedKeyId = selectedKeyByApplication[application.id] ?? "";
                  const isBusy = fulfillingApplicationId === application.id;
                  const userLabel = application.user.name
                    ? `${application.user.name} (${application.user.email})`
                    : application.user.email;

                  return (
                    <div
                      key={application.id}
                      className="rounded-2xl border border-card-border/40 bg-background/20 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">{userLabel}</div>
                        <Badge
                          variant={
                            application.status === "PENDING"
                              ? "warning"
                              : application.status === "FAILED"
                                ? "muted"
                                : "success"
                          }
                        >
                          {getApplicationStatusLabel(application.status, t)}
                        </Badge>
                      </div>

                      <dl className="mt-3 grid gap-2 text-xs text-muted">
                        <div>
                          <dt className="inline text-muted/70">
                            {t("admin.products.applications.requestedAt")} </dt>
                          <dd className="inline text-foreground/80">
                            {formatTimestamp(application.requestedAt)}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-muted/70">
                            {t("admin.products.applications.fulfilledAt")} </dt>
                          <dd className="inline text-foreground/80">
                            {formatTimestamp(application.fulfilledAt)}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-muted/70">
                            {t("admin.products.applications.providedKey")} </dt>
                          <dd className="inline text-foreground/80">
                            {application.providedApiKey
                              ? `${application.providedApiKey.label} · ${application.providedApiKey.maskedKey}`
                              : "—"}
                          </dd>
                        </div>
                      </dl>

                      {isPending ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                          <label className="space-y-2">
                            <span className="text-xs font-semibold text-muted">
                              {t("admin.products.applications.keyLabel")}
                            </span>
                            <select
                              value={selectedKeyId}
                              onChange={(event) =>
                                setSelectedKeyByApplication((current) => ({
                                  ...current,
                                  [application.id]: event.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
                            >
                              <option value="">
                                {t("admin.products.applications.keyPlaceholder")}
                              </option>
                              {activeApiKeys.map((key) => (
                                <option key={key.id} value={key.id}>
                                  {key.label} · {key.maskedKey}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Button
                            type="button"
                            disabled={isBusy || !selectedKeyId}
                            onClick={() => void handleFulfillApplication(application)}
                          >
                            {isBusy
                              ? t("admin.products.applications.fulfilling")
                              : t("admin.products.applications.fulfill")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        <Card className="border-card-border/50 bg-card/70">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">
              {t("admin.products.orders.pendingTitle")}
            </h3>
            <p className="text-sm text-muted">{t("admin.products.orders.pendingSubtitle")}</p>
          </div>

          <div className="mt-6 space-y-3">
            {ordersLoading ? (
              <p className="text-sm text-muted">{t("common.loading")}</p>
            ) : orderRows.length === 0 ? (
              <p className="text-sm text-muted">{t("admin.products.orders.empty")}</p>
            ) : (
              orderRows.map((order) => (
                <div
                  key={order.id}
                  className="rounded-2xl border border-card-border/40 bg-background/20 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-foreground">{order.product.name}</div>
                    <Badge variant="warning">
                      {getOrderStatusLabel(order.status, t)}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs text-muted">
                    <div>
                      <dt className="inline text-muted/70">{t("admin.products.orders.buyer")}: </dt>
                      <dd className="inline text-foreground/80">
                        {order.buyer.name} ({order.buyer.agentId})
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">{t("admin.products.orders.quota")}: </dt>
                      <dd className="inline text-foreground/80">
                        {order.quota.amount} {order.quota.unit}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">{t("admin.products.orders.createdAt")} </dt>
                      <dd className="inline text-foreground/80">
                        {formatTimestamp(order.createdAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex justify-end">
                    <Button
                      type="button"
                      disabled={fulfillingOrderId === order.id}
                      onClick={() => void handleFulfillOrder(order)}
                    >
                      {fulfillingOrderId === order.id
                        ? t("admin.products.orders.fulfilling")
                        : t("admin.products.orders.fulfill")}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {t("admin.products.section.active")}
          </h3>
          <p className="mt-1 text-sm text-muted">{t("admin.products.section.activeSubtitle")}</p>
        </div>
        {loading ? (
          <Card className="border-dashed border-card-border/40 bg-background/20 p-5">
            <p className="text-sm text-muted">{t("common.loading")}</p>
          </Card>
        ) : (
          renderProducts(activeProducts, true)
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {t("admin.products.section.inactive")}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {t("admin.products.section.inactiveSubtitle")}
          </p>
        </div>
        {loading ? (
          <Card className="border-dashed border-card-border/40 bg-background/20 p-5">
            <p className="text-sm text-muted">{t("common.loading")}</p>
          </Card>
        ) : (
          renderProducts(inactiveProducts, false)
        )}
      </section>
    </div>
  );
}
