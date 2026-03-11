"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchShopItems } from "@/lib/shop-client";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";

type ShopItem = {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  price: number;
  spriteKey: string;
};

const SHOP_CATEGORY_KEYS: Record<string, TranslationKey> = {
  skin: "shop.category.skin",
  hat: "shop.category.hat",
  accessory: "shop.category.accessory",
};

export function ShopCatalogContent({
  items,
  loading,
  error,
  t,
}: {
  items: ShopItem[];
  loading: boolean;
  error: string | null;
  t: (key: TranslationKey) => string;
}) {
  const groupedItems = new Map<string, ShopItem[]>();

  for (const item of items) {
    const current = groupedItems.get(item.category) ?? [];
    current.push(item);
    groupedItems.set(item.category, current);
  }

  const groupedEntries = [...groupedItems.entries()];

  if (error) {
    return (
      <div className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-danger">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <Card key={item} className="animate-pulse">
            <div className="h-5 w-2/3 rounded bg-card-border/50" />
            <div className="mt-3 h-4 w-full rounded bg-card-border/30" />
            <div className="mt-2 h-4 w-1/3 rounded bg-card-border/30" />
          </Card>
        ))}
      </div>
    );
  }

  if (groupedEntries.length === 0) {
    return (
      <EmptyState
        title={t("shop.empty")}
        description={t("shop.emptyDescription")}
      />
    );
  }

  return groupedEntries.map(([category, categoryItems]) => (
    <section key={category} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-foreground">
          {SHOP_CATEGORY_KEYS[category]
            ? t(SHOP_CATEGORY_KEYS[category])
            : category}
        </h2>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">
          {categoryItems.length} {t("shop.items")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categoryItems.map((item) => {
          return (
            <Card
              key={item.id}
              className="flex h-full flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {item.name}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {item.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-bold text-warning">
                      {item.price}
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
                      {t("shop.price")}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="muted">{item.type}</Badge>
                  <Badge variant="warning">{t("shop.price")} {item.price}</Badge>
                </div>
              </div>

              <div className="flex justify-end">
                <Link href="/wiki/prompts">
                  <Button type="button" variant="secondary">
                    {t("control.promptWiki")}
                  </Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  ));
}

export default function ShopPage() {
  const t = useT();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const catalog = await fetchShopItems();
        if (cancelled) return;
        setItems(catalog as ShopItem[]);
      } catch (nextError) {
        if (cancelled) return;
        setError(
          nextError instanceof Error ? nextError.message : t("shop.actionFailed")
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {t("shop.title")}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {t("control.shopReadOnly")}
          </p>
        </div>
        <Card className="p-4 sm:min-w-[180px]">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">
            {t("shop.balance")}
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-warning">
            —
          </p>
        </Card>
      </div>

      <ShopCatalogContent items={items} loading={loading} error={error} t={t} />
    </div>
  );
}
