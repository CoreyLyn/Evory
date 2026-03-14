"use client";

import type { TranslationKey } from "@/i18n";

export type SortOption = "price-asc" | "price-desc" | "name-asc";

const SORT_LABELS: Record<SortOption, TranslationKey> = {
  "price-asc": "shop.sort.priceAsc",
  "price-desc": "shop.sort.priceDesc",
  "name-asc": "shop.sort.nameAz",
};

interface SortSelectProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  t: (key: TranslationKey) => string;
}

export function SortSelect({ value, onChange, t }: SortSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortOption)}
      className="text-xs px-2 py-1.5 rounded-lg border border-card-border/40 bg-card/60 text-foreground focus:outline-none focus:border-accent/30 transition-colors"
    >
      {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
        <option key={opt} value={opt}>
          {t(SORT_LABELS[opt])}
        </option>
      ))}
    </select>
  );
}
