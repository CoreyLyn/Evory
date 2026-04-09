import type { TranslationKey } from "@/i18n";
import type { LobsterAppearance } from "@/canvas/sprites";
import type {
  PublicShopCatalogEntry,
  PublicShopCatalogCosmeticEntry,
  PublicShopCatalogApiQuotaProductEntry,
} from "@/lib/shop-client";

type CosmeticCategoryKey = "skin" | "hat" | "accessory";

export interface ShopItemCosmeticData {
  entryType: "cosmetic";
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  price: number;
  spriteKey: string;
}

export interface ShopItemSecretProductDetail {
  providerLabel: string | null;
  usageInstructions: string | null;
  quotaAmount: number;
  quotaUnitLabel: string;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit: number | null;
}

export interface ShopItemSecretProductData {
  entryType: "api_quota_product";
  id: string;
  name: string;
  description: string;
  price: number;
  detail: ShopItemSecretProductDetail;
}

export type ShopItemData = ShopItemCosmeticData | ShopItemSecretProductData;

export type {
  PublicShopCatalogEntry,
  PublicShopCatalogCosmeticEntry,
  PublicShopCatalogApiQuotaProductEntry,
};

export function isCosmeticCatalogEntry(
  entry: PublicShopCatalogEntry
): entry is PublicShopCatalogCosmeticEntry {
  return entry.entryType === "cosmetic";
}

export function isSecretProductCatalogEntry(
  entry: PublicShopCatalogEntry
): entry is PublicShopCatalogApiQuotaProductEntry {
  return entry.entryType === "api_quota_product";
}

export const CATEGORY_KEYS = {
  skin: "shop.category.skin",
  hat: "shop.category.hat",
  accessory: "shop.category.accessory",
} as const satisfies Record<CosmeticCategoryKey, TranslationKey>;

export function getCategoryTranslationKey(
  category: string
): TranslationKey | null {
  return Object.prototype.hasOwnProperty.call(CATEGORY_KEYS, category)
    ? CATEGORY_KEYS[category as keyof typeof CATEGORY_KEYS]
    : null;
}

/** Map a shop item to the lobster appearance config for canvas preview */
export function itemToAppearance(
  item: ShopItemCosmeticData
): LobsterAppearance {
  switch (item.type) {
    case "color":
      return { color: item.spriteKey, hat: null, accessory: null };
    case "hat":
      return { color: "red", hat: item.spriteKey, accessory: null };
    case "accessory":
      return { color: "red", hat: null, accessory: item.spriteKey };
    default:
      return { color: "red", hat: null, accessory: null };
  }
}

export function isCosmeticShopItem(
  item: ShopItemData
): item is ShopItemCosmeticData {
  return item.entryType === "cosmetic";
}

export function isSecretProductShopItem(
  item: ShopItemData
): item is ShopItemSecretProductData {
  return item.entryType === "api_quota_product";
}
