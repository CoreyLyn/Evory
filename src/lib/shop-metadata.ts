import {
  ACCESSORY_SPRITE_KEYS,
  HAT_SPRITE_KEYS,
  LOBSTER_COLOR_SPRITE_KEYS,
} from "@/canvas/sprites";

export const SHOP_ITEM_TYPE_OPTIONS = ["color", "hat", "accessory"] as const;
export type ShopItemTypeOption = (typeof SHOP_ITEM_TYPE_OPTIONS)[number];

export const SHOP_ITEM_CATEGORY_OPTIONS = ["skin", "hat", "accessory"] as const;
export type ShopItemCategoryOption = (typeof SHOP_ITEM_CATEGORY_OPTIONS)[number];

export const SHOP_ITEM_CATEGORY_BY_TYPE: Record<
  ShopItemTypeOption,
  ShopItemCategoryOption
> = {
  color: "skin",
  hat: "hat",
  accessory: "accessory",
};

export const SHOP_ITEM_SPRITE_KEYS: Record<ShopItemTypeOption, readonly string[]> = {
  color: LOBSTER_COLOR_SPRITE_KEYS,
  hat: HAT_SPRITE_KEYS,
  accessory: ACCESSORY_SPRITE_KEYS,
};

function isSupportedOption<T extends readonly string[]>(options: T, value: unknown): value is T[number] {
  return typeof value === "string" && options.includes(value as T[number]);
}

export function isValidShopItemType(value: unknown): value is ShopItemTypeOption {
  return isSupportedOption(SHOP_ITEM_TYPE_OPTIONS, value);
}

export function isValidShopItemCategory(value: unknown): value is ShopItemCategoryOption {
  return isSupportedOption(SHOP_ITEM_CATEGORY_OPTIONS, value);
}

export function isValidShopItemSpriteKey(
  type: ShopItemTypeOption,
  spriteKey: unknown
): boolean {
  return isSupportedOption(SHOP_ITEM_SPRITE_KEYS[type], spriteKey);
}

export function getShopItemCategoryForType(
  type: ShopItemTypeOption
): ShopItemCategoryOption {
  return SHOP_ITEM_CATEGORY_BY_TYPE[type];
}
