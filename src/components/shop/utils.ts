import type { TranslationKey } from "@/i18n";
import type { LobsterAppearance } from "@/canvas/sprites";

export interface ShopItemData {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  price: number;
  spriteKey: string;
}

export const CATEGORY_KEYS: Record<string, TranslationKey> = {
  skin: "shop.category.skin",
  hat: "shop.category.hat",
  accessory: "shop.category.accessory",
};

/** Map a shop item to the lobster appearance config for canvas preview */
export function itemToAppearance(item: ShopItemData): LobsterAppearance {
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
