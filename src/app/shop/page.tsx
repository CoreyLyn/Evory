"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchShopItems } from "@/lib/shop-client";
import { useT } from "@/i18n";
import { CategoryTabs } from "@/components/shop/category-tabs";
import { ItemCard } from "@/components/shop/item-card";
import { ItemDrawer } from "@/components/shop/item-drawer";
import { SortSelect, type SortOption } from "@/components/shop/sort-select";
import type { ShopItemData } from "@/components/shop/utils";

function sortItems(items: ShopItemData[], sort: SortOption): ShopItemData[] {
  const sorted = [...items];
  switch (sort) {
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "name-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return sorted;
  }
}

export default function ShopPage() {
  const t = useT();
  const [items, setItems] = useState<ShopItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("price-asc");
  const [selectedItem, setSelectedItem] = useState<ShopItemData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const catalog = await fetchShopItems();
        if (cancelled) return;
        setItems(catalog as ShopItemData[]);
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
    return () => { cancelled = true; };
  }, [t]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const item of items) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (activeTab !== "all") {
      result = result.filter((item) => item.category === activeTab);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
      );
    }
    return sortItems(result, sort);
  }, [items, activeTab, search, sort]);

  const handleCloseDrawer = useCallback(() => setSelectedItem(null), []);

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("shop.title")}
          description={t("shop.subtitle")}
        />
        <div className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-danger">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("shop.title")}
        description={t("shop.subtitle")}
        rightSlot={
          <Card className="p-4 sm:min-w-[180px]">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              {t("shop.balance")}
            </p>
            <p className="mt-2 font-display text-2xl font-bold text-warning">
              —
            </p>
          </Card>
        }
      />

      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CategoryTabs
            active={activeTab}
            onTabChange={setActiveTab}
            search={search}
            onSearchChange={setSearch}
            counts={categoryCounts}
            t={t}
          />
          <SortSelect value={sort} onChange={setSort} t={t} />
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="animate-pulse rounded-2xl border border-card-border/50 bg-card/60 p-0 overflow-hidden"
            >
              <div className="h-28 bg-foreground/[0.03]" />
              <div className="p-5 space-y-3">
                <div className="h-4 w-2/3 rounded bg-card-border/50" />
                <div className="h-3 w-full rounded bg-card-border/30" />
                <div className="flex justify-between">
                  <div className="h-3 w-16 rounded bg-card-border/30" />
                  <div className="h-5 w-12 rounded bg-card-border/30" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title={t("shop.empty")}
          description={t("shop.emptyDescription")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onClick={setSelectedItem}
            />
          ))}
        </div>
      )}

      <ItemDrawer item={selectedItem} onClose={handleCloseDrawer} />
    </div>
  );
}
