"use client";

import { useT } from "@/i18n";
import { LobsterPreview } from "./lobster-preview";
import {
  itemToAppearance,
  getCategoryTranslationKey,
  isCosmeticShopItem,
  isSecretProductShopItem,
  type ShopItemData,
} from "./utils";

interface ItemCardProps {
  item: ShopItemData;
  onClick: (item: ShopItemData) => void;
}

export function ItemCard({ item, onClick }: ItemCardProps) {
  const t = useT();

  if (isSecretProductShopItem(item)) {
    const providerLabel =
      item.detail.providerLabel?.trim() || t("shop.secret.providerFallback");
    const quotaLabel = `${item.detail.quotaAmount} ${item.detail.quotaUnitLabel}`;
    const showOneTime = !item.detail.allowRepeatPurchase;

    return (
      <button
        onClick={() => onClick(item)}
        className="group w-full text-left rounded-2xl border border-card-border/50 bg-card/60 backdrop-blur-md px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_8px_20px_-6px_rgba(0,0,0,0.1)] transition-all duration-300 hover:border-accent/30 hover:shadow-[0_12px_32px_-8px_rgba(255,107,74,0.15)]"
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {providerLabel}
            </p>
            <h3 className="text-base font-semibold text-foreground truncate">
              {item.name}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md bg-muted/10 text-muted/80 border border-muted/10">
              {quotaLabel}
            </span>
            {showOneTime && (
              <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md bg-warning/10 text-warning border border-warning/20">
                {t("shop.secret.oneTimeVisible")}
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-1">
            <span className="text-lg font-bold text-warning font-display">
              {item.price}
            </span>
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted">
              {t("common.pts")}
            </span>
          </div>
        </div>
      </button>
    );
  }

  if (isCosmeticShopItem(item)) {
    const appearance = itemToAppearance(item);
    const categoryKey = getCategoryTranslationKey(item.category);
    const categoryLabel = categoryKey ? t(categoryKey) : item.category;

    return (
      <button
        onClick={() => onClick(item)}
        className="group w-full text-left rounded-2xl border border-card-border/50 bg-card/60 backdrop-blur-md p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_8px_20px_-6px_rgba(0,0,0,0.1)] transition-all duration-300 hover:border-accent/30 hover:shadow-[0_12px_32px_-8px_rgba(255,107,74,0.15)] overflow-hidden"
      >
        {/* Preview area */}
        <div className="flex items-center justify-center bg-gradient-to-b from-foreground/[0.03] to-transparent py-5 group-hover:from-accent/[0.04] transition-colors duration-300">
          <LobsterPreview
            appearance={appearance}
            size={80}
            className="group-hover:scale-110 transition-transform duration-300"
          />
        </div>

        {/* Info area */}
        <div className="px-5 pb-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground truncate">
                {item.name}
              </h3>
              <p className="mt-1 text-sm text-muted line-clamp-2 leading-relaxed">
                {item.description}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md bg-muted/10 text-muted/80 border border-muted/10">
              {categoryLabel}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-warning font-display">
              {item.price}
            </span>
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted">
              {t("common.pts")}
            </span>
          </div>
        </div>
        </div>
      </button>
    );
  }

  return null;
}
