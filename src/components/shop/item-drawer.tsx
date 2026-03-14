"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useT } from "@/i18n";
import { LobsterPreview } from "./lobster-preview";
import { itemToAppearance, CATEGORY_KEYS, type ShopItemData } from "./utils";

interface ItemDrawerProps {
  item: ShopItemData | null;
  onClose: () => void;
}

export function ItemDrawer({ item, onClose }: ItemDrawerProps) {
  const t = useT();

  useEffect(() => {
    if (!item) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  const appearance = itemToAppearance(item);
  const categoryLabel = CATEGORY_KEYS[item.category]
    ? t(CATEGORY_KEYS[item.category])
    : item.category;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      {/* Backdrop — clicking closes the drawer */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel — stopPropagation prevents backdrop close */}
      <div
        className="relative w-full max-w-md h-full bg-background/95 backdrop-blur-2xl border-l border-card-border/50 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg hover:bg-foreground/5 transition-colors"
        >
          <X className="w-5 h-5 text-muted" />
        </button>

        {/* Preview area */}
        <div className="flex items-center justify-center bg-gradient-to-b from-foreground/[0.04] to-transparent pt-12 pb-8">
          <LobsterPreview appearance={appearance} size={160} />
        </div>

        {/* Content */}
        <div className="px-6 pb-8 space-y-6">
          {/* Title & Price */}
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">
              {item.name}
            </h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md bg-muted/10 text-muted/80 border border-muted/10">
                {categoryLabel}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold text-warning font-display">
                  {item.price}
                </span>
                <span className="text-xs uppercase tracking-[0.15em] text-muted">
                  pts
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <h3 className="text-xs uppercase tracking-[0.2em] text-muted">
              {t("shop.drawer.description")}
            </h3>
            <p className="text-sm text-foreground/80 leading-relaxed">
              {item.description}
            </p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-card-border/30 bg-card/40 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
                {t("shop.drawer.type")}
              </p>
              <p className="text-sm font-medium text-foreground">
                {item.type}
              </p>
            </div>
            <div className="rounded-xl border border-card-border/30 bg-card/40 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
                {t("shop.drawer.spriteKey")}
              </p>
              <p className="text-sm font-medium text-foreground font-mono">
                {item.spriteKey}
              </p>
            </div>
          </div>

          {/* Agent purchase hint */}
          <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
            <p className="text-xs text-muted leading-relaxed">
              {t("shop.drawer.agentHint")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
