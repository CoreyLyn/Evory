"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { TranslationKey } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createAdminSecretProduct,
  fetchAdminSecretProductOrders,
  fetchAdminSecretProducts,
  importAdminSecretInventory,
  type AdminSecretProductOrder,
  type AdminSecretProduct,
  type AdminSecretProductUpdateInput,
  type SecretProductOrderStatus,
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
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimitMode: "unlimited" | "limited";
  perAgentPurchaseLimit: number | null;
};

type InventoryDraft = {
  productId: string;
  sourceLabel: string;
  note: string;
  secrets: string;
};

type AdminSecretInventoryRow = {
  id: string;
  maskedValue: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD" | "VOID";
  createdAt: string;
  soldAt: string | null;
  importBatch: {
    id: string;
    sourceLabel: string;
    note: string;
    importedByUserId: string;
    createdAt: string;
  } | null;
};

type AdminSecretInventoryResponse = {
  productId: string;
  inventory: AdminSecretInventoryRow[];
};

type OrderStatusFilter = "ALL" | SecretProductOrderStatus;

export function createInitialProductDraft(): ProductDraft {
  return {
    name: "",
    description: "",
    price: 0,
    providerLabel: "",
    usageInstructions: "",
    allowRepeatPurchase: true,
    perAgentPurchaseLimitMode: "unlimited",
    perAgentPurchaseLimit: null,
  };
}

function createInitialInventoryDraft(): InventoryDraft {
  return {
    productId: "",
    sourceLabel: "",
    note: "",
    secrets: "",
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

function getAvailableInventoryCount(product: AdminSecretProduct) {
  const extended = product as AdminSecretProduct & {
    availableInventoryCount?: number;
  };
  if (typeof extended.availableInventoryCount === "number") {
    return extended.availableInventoryCount;
  }
  return 0;
}

function getSoldInventoryCount(product: AdminSecretProduct) {
  const extended = product as AdminSecretProduct & { soldInventoryCount?: number };
  return typeof extended.soldInventoryCount === "number"
    ? extended.soldInventoryCount
    : 0;
}

function getVoidInventoryCount(product: AdminSecretProduct) {
  const extended = product as AdminSecretProduct & { voidInventoryCount?: number };
  return typeof extended.voidInventoryCount === "number"
    ? extended.voidInventoryCount
    : 0;
}

function getInventoryStatusLabel(
  status: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
) {
  switch (status) {
    case "AVAILABLE":
      return t("admin.products.inventory.status.available");
    case "SOLD":
      return t("admin.products.inventory.status.sold");
    case "VOID":
      return t("admin.products.inventory.status.void");
    case "RESERVED":
      return t("admin.products.inventory.status.reserved");
    default:
      return status;
  }
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
  overrides?: Partial<Pick<AdminSecretProductUpdateInput, "name" | "description" | "price">>;
}): AdminSecretProductUpdateInput {
  return {
    name: overrides?.name ?? product.name,
    description: overrides?.description ?? product.description,
    price: overrides?.price ?? product.price,
    providerLabel: getProviderLabel(product),
    usageInstructions: getUsageInstructions(product),
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function formatInventoryTimestamp(value: string | null) {
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
  const [inventoryDraft, setInventoryDraft] = useState<InventoryDraft>(() =>
    createInitialInventoryDraft()
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [actionProductId, setActionProductId] = useState<string | null>(null);
  const [inventoryRows, setInventoryRows] = useState<AdminSecretInventoryRow[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [voidingInventoryId, setVoidingInventoryId] = useState<string | null>(null);
  const [orderRows, setOrderRows] = useState<AdminSecretProductOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatusFilter>("ALL");
  const [orderBuyerAgentId, setOrderBuyerAgentId] = useState("");

  useEffect(() => {
    const normalizedProductId = normalizeInventoryProductId(
      products,
      inventoryDraft.productId
    );
    if (normalizedProductId !== inventoryDraft.productId) {
      setInventoryDraft((current) => ({
        ...current,
        productId: normalizedProductId,
      }));
    }
  }, [inventoryDraft.productId, products]);

  const activeProducts = products.filter((product) => product.isActive);
  const inactiveProducts = products.filter((product) => !product.isActive);
  const selectedInventoryProduct = products.find(
    (product) => product.id === inventoryDraft.productId
  );

  async function fetchInventoryDetails(productId: string) {
    const response = await fetch(`/api/admin/shop/products/${productId}/inventory`);
    const json = (await response.json()) as {
      success?: boolean;
      error?: string;
      data?: AdminSecretInventoryResponse;
    };

    if (!response.ok || !json.success || !json.data) {
      throw new Error(json.error ?? t("admin.actionFailed"));
    }

    return json.data;
  }

  async function refreshInventory(productId = inventoryDraft.productId) {
    if (!productId) {
      setInventoryRows([]);
      return;
    }

    setInventoryLoading(true);
    setInventoryError(null);

    try {
      const data = await fetchInventoryDetails(productId);
      setInventoryRows(data.inventory);
    } catch (error) {
      setInventoryError(getErrorMessage(error, t("admin.actionFailed")));
      setInventoryRows([]);
    } finally {
      setInventoryLoading(false);
    }
  }

  async function fetchOrderHistory({
    productId,
    buyerAgentId,
    status,
  }: {
    productId: string;
    buyerAgentId: string;
    status: OrderStatusFilter;
  }) {
    return fetchAdminSecretProductOrders(fetch, {
      productId,
      buyerAgentId: buyerAgentId.trim() || undefined,
      status: status === "ALL" ? undefined : status,
    });
  }

  async function refreshOrders({
    productId = inventoryDraft.productId,
    buyerAgentId = orderBuyerAgentId,
    status = orderStatusFilter,
  }: {
    productId?: string;
    buyerAgentId?: string;
    status?: OrderStatusFilter;
  } = {}) {
    if (!productId) {
      setOrderRows([]);
      return;
    }

    setOrdersLoading(true);
    setOrdersError(null);

    try {
      const data = await fetchOrderHistory({
        productId,
        buyerAgentId,
        status,
      });
      setOrderRows(data);
    } catch (error) {
      setOrdersError(getErrorMessage(error, t("admin.actionFailed")));
      setOrderRows([]);
    } finally {
      setOrdersLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    if (!inventoryDraft.productId) {
      setInventoryRows([]);
      return;
    }

    setInventoryLoading(true);
    setInventoryError(null);

    fetchInventoryDetails(inventoryDraft.productId)
      .then((data) => {
        if (!cancelled) {
          setInventoryRows(data.inventory);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setInventoryError(getErrorMessage(error, t("admin.actionFailed")));
          setInventoryRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInventoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inventoryDraft.productId, t]);

  useEffect(() => {
    let cancelled = false;

    if (!inventoryDraft.productId) {
      setOrderRows([]);
      return;
    }

    setOrdersLoading(true);
    setOrdersError(null);

    fetchOrderHistory({
      productId: inventoryDraft.productId,
      buyerAgentId: orderBuyerAgentId,
      status: orderStatusFilter,
    })
      .then((data) => {
        if (!cancelled) {
          setOrderRows(data);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setOrdersError(getErrorMessage(error, t("admin.actionFailed")));
          setOrderRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOrdersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inventoryDraft.productId, orderBuyerAgentId, orderStatusFilter, t]);

  function resetProductDraft() {
    setProductDraft(createInitialProductDraft());
    setEditingId(null);
  }

  function startEdit(product: AdminSecretProduct) {
    setEditingId(product.id);
    setProductDraft(createProductDraftFromProduct(product));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    onError(null);
    onSuccess(null);

    const limitResolution = resolvePerAgentPurchaseLimit(
      productDraft.perAgentPurchaseLimitMode,
      productDraft.perAgentPurchaseLimit
    );

    if (limitResolution.error) {
      onError(t(limitResolution.error));
      setSubmitting(false);
      return;
    }

    const editingProduct = editingId
      ? products.find((product) => product.id === editingId)
      : null;

    if (editingId && !editingProduct) {
      onError(t("admin.products.editMissing"));
      setSubmitting(false);
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
      setSubmitting(false);
    }
  }

  async function handleActivation(
    product: AdminSecretProduct,
    nextIsActive: boolean
  ) {
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

  async function handleImportInventory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!inventoryDraft.productId) {
      onError(t("admin.products.inventory.noProductSelected"));
      return;
    }

    setImporting(true);
    onError(null);
    onSuccess(null);

    try {
      const didSucceed = await performAdminSecretProductMutation({
        request: async () => {
          await importAdminSecretInventory(fetch, inventoryDraft);
          return { success: true };
        },
        onRefresh: async () => {
          await onRefresh();
          await refreshInventory();
          await refreshOrders();
        },
        onError,
        onSuccess,
        successMessage: t("admin.products.inventory.importSuccess"),
        errorFallback: t("admin.actionFailed"),
      });
      if (didSucceed) {
        setInventoryDraft((current) => ({
          ...createInitialInventoryDraft(),
          productId: current.productId,
        }));
      }
    } catch (error) {
      onError(getErrorMessage(error, t("admin.actionFailed")));
    } finally {
      setImporting(false);
    }
  }

  async function handleVoidInventory(row: AdminSecretInventoryRow) {
    if (row.status !== "AVAILABLE") {
      return;
    }

    setVoidingInventoryId(row.id);
    onError(null);
    onSuccess(null);

    try {
      await performAdminSecretProductMutation({
        request: async () => {
          const response = await fetch(`/api/admin/shop/inventory/${row.id}/void`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          });
          const json = (await response.json()) as MutationResponse;

          if (!response.ok || !json.success) {
            return {
              success: false,
              error: json.error || t("admin.actionFailed"),
            };
          }

          return { success: true };
        },
        onRefresh: async () => {
          await onRefresh();
          await refreshInventory();
          await refreshOrders();
        },
        onError,
        onSuccess,
        successMessage: t("admin.actionSuccess"),
        errorFallback: t("admin.actionFailed"),
      });
    } catch (error) {
      onError(getErrorMessage(error, t("admin.actionFailed")));
    } finally {
      setVoidingInventoryId(null);
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
            const availableInventoryCount = getAvailableInventoryCount(product);
            const soldInventoryCount = getSoldInventoryCount(product);
            const voidInventoryCount = getVoidInventoryCount(product);
            const isLowStock = availableInventoryCount <= 3;
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
                      variant={
                        getEffectiveAllowRepeatPurchase(product) ? "default" : "muted"
                      }
                    >
                      {getEffectiveAllowRepeatPurchase(product)
                        ? t("admin.products.badge.repeatAllowed")
                        : t("admin.products.badge.repeatBlocked")}
                    </Badge>
                    {isLowStock ? (
                      <Badge variant="warning">{t("admin.products.badge.lowStock")}</Badge>
                    ) : null}
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
                        {t("admin.products.inventory.count")}:{" "}
                      </dt>
                      <dd className="inline text-foreground/80">
                        {availableInventoryCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.products.inventory.breakdown.sold")}{" "}
                      </dt>
                      <dd className="inline text-foreground/80">
                        {soldInventoryCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.products.inventory.breakdown.void")}{" "}
                      </dt>
                      <dd className="inline text-foreground/80">
                        {voidInventoryCount}
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
                  {getUsageInstructions(product) ? (
                    <p className="mt-3 text-xs text-muted">
                      {getUsageInstructions(product)}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    disabled={submitting || isActionBusy}
                    onClick={() => startEdit(product)}
                  >
                    {t("admin.products.action.edit")}
                  </Button>
                  <Button
                    type="button"
                    variant={product.isActive ? "danger" : "secondary"}
                    className="px-3 py-1.5 text-xs"
                    disabled={submitting || isActionBusy}
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
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    onClick={() =>
                      setInventoryDraft((current) => ({
                        ...current,
                        productId: product.id,
                      }))
                    }
                  >
                    {t("admin.products.inventory.useForImport")}
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

        <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
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
                        mode === "unlimited"
                          ? null
                          : current.perAgentPurchaseLimit ?? 1,
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
                disabled={submitting}
                onClick={resetProductDraft}
              >
                {t("admin.products.action.cancelEdit")}
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting
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

      <Card className="border-card-border/50 bg-card/70">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">
            {t("admin.products.inventory.title")}
          </h3>
          <p className="text-sm text-muted">{t("admin.products.inventory.subtitle")}</p>
        </div>

        <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleImportInventory}>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.inventory.product")}
            </span>
            <select
              value={inventoryDraft.productId}
              onChange={(event) =>
                setInventoryDraft((current) => ({
                  ...current,
                  productId: event.target.value,
                }))
              }
              disabled={products.length === 0}
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            >
              {products.length === 0 ? (
                <option value="">{t("admin.products.inventory.empty")}</option>
              ) : null}
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.inventory.sourceLabel")}
            </span>
            <input
              value={inventoryDraft.sourceLabel}
              onChange={(event) =>
                setInventoryDraft((current) => ({
                  ...current,
                  sourceLabel: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.inventory.note")}
            </span>
            <textarea
              value={inventoryDraft.note}
              onChange={(event) =>
                setInventoryDraft((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              className="min-h-20 w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.inventory.secrets")}
            </span>
            <textarea
              value={inventoryDraft.secrets}
              onChange={(event) =>
                setInventoryDraft((current) => ({
                  ...current,
                  secrets: event.target.value,
                }))
              }
              className="min-h-36 w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <div className="flex justify-end md:col-span-2">
            <Button type="submit" disabled={importing || products.length === 0}>
              {importing
                ? t("admin.products.inventory.submitting")
                : t("admin.products.inventory.submit")}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-card-border/50 bg-card/70">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">
            {t("admin.products.inventory.details.title")}
          </h3>
          <p className="text-sm text-muted">
            {t("admin.products.inventory.details.subtitle")}
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-card-border/40 bg-background/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.16em] text-muted/70">
            {t("admin.products.inventory.details.selectedProduct")}
          </div>
          <div className="mt-1 text-sm text-foreground">
            {selectedInventoryProduct?.name ??
              t("admin.products.inventory.details.noneSelected")}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {!inventoryDraft.productId ? (
            <p className="text-sm text-muted">
              {t("admin.products.inventory.details.selectProduct")}
            </p>
          ) : inventoryLoading ? (
            <p className="text-sm text-muted">{t("common.loading")}</p>
          ) : inventoryError ? (
            <p className="text-sm text-danger">{inventoryError}</p>
          ) : inventoryRows.length === 0 ? (
            <p className="text-sm text-muted">
              {t("admin.products.inventory.details.empty")}
            </p>
          ) : (
            <div className="space-y-3">
              {inventoryRows.map((row) => {
                const statusVariant =
                  row.status === "AVAILABLE"
                    ? "success"
                    : row.status === "SOLD"
                      ? "muted"
                      : row.status === "VOID"
                        ? "danger"
                        : "warning";
                const isVoidBusy = voidingInventoryId === row.id;

                return (
                  <div
                    key={row.id}
                    className="rounded-2xl border border-card-border/40 bg-background/20 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {row.maskedValue}
                      </span>
                      <Badge variant={statusVariant}>
                        {getInventoryStatusLabel(row.status, t)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>
                        {t("admin.products.inventory.details.created")}{" "}
                        {formatInventoryTimestamp(row.createdAt)}
                      </span>
                      <span>
                        {t("admin.products.inventory.details.sold")}{" "}
                        {formatInventoryTimestamp(row.soldAt)}
                      </span>
                      <span>
                        {t("admin.products.inventory.details.batch")}{" "}
                        {row.importBatch?.sourceLabel ??
                          t("admin.products.inventory.details.unknown")}
                      </span>
                    </div>
                    {row.importBatch?.note ? (
                      <p className="mt-2 text-xs text-muted">
                        {t("admin.products.inventory.details.note")}{" "}
                        {row.importBatch.note}
                      </p>
                    ) : null}
                    {row.status === "AVAILABLE" ? (
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="danger"
                          className="px-3 py-1.5 text-xs"
                          disabled={isVoidBusy}
                          onClick={() => void handleVoidInventory(row)}
                        >
                          {isVoidBusy
                            ? t("admin.products.inventory.details.voiding")
                            : t("admin.products.inventory.details.void")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card className="border-card-border/50 bg-card/70">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">
            {t("admin.products.orders.title")}
          </h3>
          <p className="text-sm text-muted">{t("admin.products.orders.subtitle")}</p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-card-border/40 bg-background/20 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.16em] text-muted/70">
              {t("admin.products.inventory.details.selectedProduct")}
            </div>
            <div className="mt-1 text-sm text-foreground">
              {selectedInventoryProduct?.name ??
                t("admin.products.inventory.details.noneSelected")}
            </div>
          </div>

          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.orders.filters.status")}
            </span>
            <select
              value={orderStatusFilter}
              onChange={(event) =>
                setOrderStatusFilter(event.target.value as OrderStatusFilter)
              }
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            >
              <option value="ALL">
                {t("admin.products.orders.filters.allStatuses")}
              </option>
              <option value="FULFILLED">
                {t("admin.products.orders.status.fulfilled")}
              </option>
              <option value="PENDING">
                {t("admin.products.orders.status.pending")}
              </option>
              <option value="FAILED">
                {t("admin.products.orders.status.failed")}
              </option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.products.orders.filters.buyerAgentId")}
            </span>
            <input
              value={orderBuyerAgentId}
              onChange={(event) => setOrderBuyerAgentId(event.target.value)}
              placeholder={t("admin.products.orders.filters.buyerAgentIdPlaceholder")}
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>
        </div>

        <div className="mt-4 space-y-3">
          {!inventoryDraft.productId ? (
            <p className="text-sm text-muted">
              {t("admin.products.inventory.details.selectProduct")}
            </p>
          ) : ordersLoading ? (
            <p className="text-sm text-muted">{t("common.loading")}</p>
          ) : ordersError ? (
            <p className="text-sm text-danger">{ordersError}</p>
          ) : orderRows.length === 0 ? (
            <p className="text-sm text-muted">{t("admin.products.orders.empty")}</p>
          ) : (
            <div className="space-y-3">
              {orderRows.map((order) => (
                <div
                  key={order.id}
                  className="rounded-2xl border border-card-border/40 bg-background/20 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {order.buyer.name}
                    </span>
                    <Badge variant="default">{order.buyer.agentId}</Badge>
                    <Badge variant="muted">
                      {getOrderStatusLabel(order.status, t)}
                    </Badge>
                  </div>
                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.products.orders.maskedSecret")}{" "}
                      </dt>
                      <dd className="inline text-foreground/80">
                        {order.delivery.maskedSecret ??
                          t("admin.products.inventory.details.unknown")}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.products.orders.createdAt")}{" "}
                      </dt>
                      <dd className="inline text-foreground/80">
                        {formatInventoryTimestamp(order.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.products.orders.fulfilledAt")}{" "}
                      </dt>
                      <dd className="inline text-foreground/80">
                        {formatInventoryTimestamp(order.fulfilledAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.products.orders.deliveredAt")}{" "}
                      </dt>
                      <dd className="inline text-foreground/80">
                        {formatInventoryTimestamp(order.delivery.deliveredAt)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="text-muted animate-pulse">{t("common.loading")}</span>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {t("admin.products.section.active")}
              </h3>
              <Badge variant="success">{activeProducts.length}</Badge>
            </div>
            {renderProducts(activeProducts, true)}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {t("admin.products.section.inactive")}
              </h3>
              <Badge variant="muted">{inactiveProducts.length}</Badge>
            </div>
            {renderProducts(inactiveProducts, false)}
          </section>
        </div>
      )}
    </div>
  );
}
