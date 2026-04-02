"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { TranslationKey } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createAdminSecretProduct,
  importAdminSecretInventory,
  type AdminSecretProduct,
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
};

type InventoryDraft = {
  productId: string;
  sourceLabel: string;
  note: string;
  secrets: string;
};

function createInitialProductDraft(): ProductDraft {
  return {
    name: "",
    description: "",
    price: 0,
    providerLabel: "",
    usageInstructions: "",
    allowRepeatPurchase: true,
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
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
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

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

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setCreating(true);
    onError(null);
    onSuccess(null);

    try {
      const didSucceed = await performAdminSecretProductMutation({
        request: async () => {
          await createAdminSecretProduct(fetch, {
            name: productDraft.name,
            description: productDraft.description,
            price: Number.isFinite(productDraft.price)
              ? Math.max(0, Math.trunc(productDraft.price))
              : 0,
            providerLabel: productDraft.providerLabel,
            usageInstructions: productDraft.usageInstructions,
            allowRepeatPurchase: productDraft.allowRepeatPurchase,
          });

          return { success: true };
        },
        onRefresh,
        onError,
        onSuccess,
        successMessage: t("admin.products.createSuccess"),
        errorFallback: t("admin.actionFailed"),
      });
      if (didSucceed) {
        setProductDraft(createInitialProductDraft());
      }
    } catch (error) {
      onError(getErrorMessage(error, t("admin.actionFailed")));
    } finally {
      setCreating(false);
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
        onRefresh,
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
          {itemsToRender.map((product) => (
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
                    <dd className="inline text-foreground/80">{product.inventoryCount}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted/70">
                      {t("admin.products.orders.count")}:{" "}
                    </dt>
                    <dd className="inline text-foreground/80">{product.orderCount}</dd>
                  </div>
                </dl>
                {getUsageInstructions(product) ? (
                  <p className="mt-3 text-xs text-muted">{getUsageInstructions(product)}</p>
                ) : null}
              </div>

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
          ))}
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
                {t("admin.products.createTitle")}
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

        <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleCreateProduct}>
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

          <div className="flex justify-end md:col-span-2">
            <Button type="submit" disabled={creating}>
              {creating
                ? t("admin.products.form.submittingCreate")
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
