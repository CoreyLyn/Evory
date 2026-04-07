"use client";

import { Search } from "lucide-react";
import type { TranslationKey } from "@/i18n";
export type ShopProductTypeFilter = "all" | "cosmetics" | "secretProducts";
export type ShopProductTypeCounts = {
  all: number;
  cosmetics: number;
  secretProducts: number;
};

type CategoryTabsTranslationKey = Extract<
  TranslationKey,
  | "shop.filter.all"
  | "shop.filter.cosmetics"
  | "shop.filter.secretProducts"
  | "shop.search.placeholder"
>;

type TabOption = {
  key: ShopProductTypeFilter;
  labelKey: CategoryTabsTranslationKey;
};

const TAB_OPTIONS = [
  { key: "all", labelKey: "shop.filter.all" },
  { key: "cosmetics", labelKey: "shop.filter.cosmetics" },
  { key: "secretProducts", labelKey: "shop.filter.secretProducts" },
] as const satisfies readonly TabOption[];

interface CategoryTabsProps {
  active: ShopProductTypeFilter;
  onTabChange: (tab: ShopProductTypeFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  counts: ShopProductTypeCounts;
  t: (key: CategoryTabsTranslationKey) => string;
}

export function CategoryTabs({
  active,
  onTabChange,
  search,
  onSearchChange,
  counts,
  t,
}: CategoryTabsProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto">
        {TAB_OPTIONS.map(({ key, labelKey }) => {
          const isActive = active === key;
          const count = counts[key] ?? 0;
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-accent/15 text-accent"
                  : "bg-foreground/5 text-muted hover:text-foreground hover:bg-foreground/[0.08]"
              }`}
            >
              {t(labelKey)}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                  isActive
                    ? "bg-accent/20 text-accent"
                    : "bg-foreground/5 text-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative sm:w-56">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("shop.search.placeholder")}
          className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-card-border/40 bg-card/60 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/30 transition-colors"
        />
      </div>
    </div>
  );
}
