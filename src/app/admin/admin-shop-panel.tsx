"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { TranslationKey } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  SHOP_ITEM_CATEGORY_OPTIONS,
  SHOP_ITEM_SPRITE_KEYS,
  SHOP_ITEM_TYPE_OPTIONS,
  type ShopItemCategoryOption,
  type ShopItemTypeOption,
} from "@/lib/shop-metadata";

export type AdminShopItem = {
  id: string;
  name: string;
  description: string;
  type: ShopItemTypeOption;
  category: ShopItemCategoryOption;
  price: number;
  spriteKey: string;
  isActive: boolean;
  purchaseCount: number;
};

type MutationResponse = {
  success: boolean;
  error?: string;
};

type AdminShopDraft = {
  name: string;
  description: string;
  type: ShopItemTypeOption;
  category: ShopItemCategoryOption;
  price: number;
  spriteKey: string;
  isActive: boolean;
};

function createInitialDraft(): AdminShopDraft {
  const type = SHOP_ITEM_TYPE_OPTIONS[0];

  return {
    name: "",
    description: "",
    type,
    category: SHOP_ITEM_CATEGORY_OPTIONS[0],
    price: 0,
    spriteKey: SHOP_ITEM_SPRITE_KEYS[type][0],
    isActive: true,
  };
}

function formatFormPayload(draft: AdminShopDraft) {
  return {
    ...draft,
    price: Number.isFinite(draft.price) ? Math.max(0, Math.trunc(draft.price)) : 0,
  };
}

export async function performAdminShopMutation({
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

export function AdminShopPanel({
  t,
  items,
  loading,
  busyItemId,
  onRefresh,
  onError,
  onSuccess,
}: {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  items: AdminShopItem[];
  loading: boolean;
  busyItemId: string | null;
  onRefresh: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState<AdminShopDraft>(() => createInitialDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionItemId, setActionItemId] = useState<string | null>(null);

  useEffect(() => {
    if (SHOP_ITEM_SPRITE_KEYS[draft.type].includes(draft.spriteKey)) {
      return;
    }

    setDraft((current) => ({
      ...current,
      spriteKey: SHOP_ITEM_SPRITE_KEYS[current.type][0],
    }));
  }, [draft.spriteKey, draft.type]);

  const activeItems = items.filter((item) => item.isActive);
  const inactiveItems = items.filter((item) => !item.isActive);

  function resetDraft() {
    setDraft(createInitialDraft());
    setEditingId(null);
  }

  function startEdit(item: AdminShopItem) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      description: item.description,
      type: item.type,
      category: item.category,
      price: item.price,
      spriteKey: item.spriteKey,
      isActive: item.isActive,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    onError(null);
    onSuccess(null);

    try {
      const didSucceed = await performAdminShopMutation({
        request: async () => {
          const response = await fetch(
            editingId ? `/api/admin/shop/items/${editingId}` : "/api/admin/shop/items",
            {
              method: editingId ? "PUT" : "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(formatFormPayload(draft)),
            }
          );

          return response.json();
        },
        onRefresh,
        onError,
        onSuccess,
        successMessage: editingId
          ? t("admin.shop.updateSuccess")
          : t("admin.shop.createSuccess"),
        errorFallback: t("admin.actionFailed"),
      });
      if (didSucceed) {
        resetDraft();
      }
    } catch {
      onError(t("admin.actionFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleActivation(item: AdminShopItem, nextIsActive: boolean) {
    setActionItemId(item.id);
    onError(null);
    onSuccess(null);

    try {
      await performAdminShopMutation({
        request: async () => {
          const response = await fetch(
            `/api/admin/shop/items/${item.id}/${nextIsActive ? "activate" : "deactivate"}`,
            {
              method: "POST",
            }
          );

          return response.json();
        },
        onRefresh,
        onError,
        onSuccess,
        successMessage: nextIsActive
          ? t("admin.shop.activateSuccess")
          : t("admin.shop.deactivateSuccess"),
        errorFallback: t("admin.actionFailed"),
      });
    } catch {
      onError(t("admin.actionFailed"));
    } finally {
      setActionItemId(null);
    }
  }

  function renderList(itemsToRender: AdminShopItem[], active: boolean) {
    if (itemsToRender.length === 0) {
      return (
        <Card className="border-dashed border-card-border/40 bg-background/20 p-5">
          <p className="text-sm text-muted">
            {active ? t("admin.shop.empty.active") : t("admin.shop.empty.inactive")}
          </p>
        </Card>
      );
    }

    return (
      <Card className="overflow-hidden p-0">
        <div className="divide-y divide-card-border/30">
          {itemsToRender.map((item) => {
            const isActionBusy = actionItemId === item.id || busyItemId === item.id;

            return (
              <div
                key={item.id}
                className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{item.name}</h3>
                    <Badge variant={item.isActive ? "success" : "muted"}>
                      {item.isActive
                        ? t("admin.shop.status.active")
                        : t("admin.shop.status.inactive")}
                    </Badge>
                    <Badge variant="warning">
                      {t("admin.shop.purchaseCount")}: {item.purchaseCount}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {item.description || t("admin.shop.descriptionEmpty")}
                  </p>
                  <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
                    <div>
                      <dt className="inline text-muted/70">{t("admin.shop.form.type")}: </dt>
                      <dd className="inline text-foreground/80">{item.type}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.shop.form.category")}:{" "}
                      </dt>
                      <dd className="inline text-foreground/80">{item.category}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">{t("admin.shop.form.price")}: </dt>
                      <dd className="inline text-foreground/80">{item.price}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted/70">
                        {t("admin.shop.form.spriteKey")}:{" "}
                      </dt>
                      <dd className="inline text-foreground/80">{item.spriteKey}</dd>
                    </div>
                  </dl>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    type="button"
                    className="px-3 py-1.5 text-xs"
                    disabled={submitting || isActionBusy}
                    onClick={() => startEdit(item)}
                  >
                    {t("admin.shop.action.edit")}
                  </Button>
                  <Button
                    variant={item.isActive ? "danger" : "secondary"}
                    type="button"
                    className="px-3 py-1.5 text-xs"
                    disabled={submitting || isActionBusy}
                    onClick={() => void handleActivation(item, !item.isActive)}
                  >
                    {isActionBusy
                      ? item.isActive
                        ? t("admin.shop.action.deactivating")
                        : t("admin.shop.action.activating")
                      : item.isActive
                        ? t("admin.shop.action.deactivate")
                        : t("admin.shop.action.activate")}
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
              {t("admin.shop.title")}
            </p>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {editingId ? t("admin.shop.editTitle") : t("admin.shop.createTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted">{t("admin.shop.subtitle")}</p>
            </div>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-card-border/40 bg-background/25 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-muted/70">
                {t("admin.shop.section.active")}
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {activeItems.length}
              </div>
            </div>
            <div className="rounded-2xl border border-card-border/40 bg-background/25 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-muted/70">
                {t("admin.shop.section.inactive")}
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {inactiveItems.length}
              </div>
            </div>
          </div>
        </div>

        <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.shop.form.name")}
            </span>
            <input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.shop.form.price")}
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={draft.price}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  price: Number(event.target.value || 0),
                }))
              }
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.shop.form.description")}
            </span>
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className="min-h-24 w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.shop.form.type")}
            </span>
            <select
              value={draft.type}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  type: event.target.value as ShopItemTypeOption,
                }))
              }
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            >
              {SHOP_ITEM_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.shop.form.category")}
            </span>
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  category: event.target.value as ShopItemCategoryOption,
                }))
              }
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            >
              {SHOP_ITEM_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold text-muted">
              {t("admin.shop.form.spriteKey")}
            </span>
            <select
              value={draft.spriteKey}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  spriteKey: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            >
              {SHOP_ITEM_SPRITE_KEYS[draft.type].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-card-border/40 bg-background/20 px-4 py-3">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-card-border"
            />
            <span className="text-sm text-foreground">{t("admin.shop.form.isActive")}</span>
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-2">
            {editingId ? (
              <Button
                variant="ghost"
                type="button"
                disabled={submitting}
                onClick={resetDraft}
              >
                {t("admin.shop.action.cancelEdit")}
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting
                ? editingId
                  ? t("admin.shop.form.submittingUpdate")
                  : t("admin.shop.form.submittingCreate")
                : editingId
                  ? t("admin.shop.form.submitUpdate")
                  : t("admin.shop.form.submitCreate")}
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
                {t("admin.shop.section.active")}
              </h3>
              <Badge variant="success">{activeItems.length}</Badge>
            </div>
            {renderList(activeItems, true)}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {t("admin.shop.section.inactive")}
              </h3>
              <Badge variant="muted">{inactiveItems.length}</Badge>
            </div>
            {renderList(inactiveItems, false)}
          </section>
        </div>
      )}
    </div>
  );
}
