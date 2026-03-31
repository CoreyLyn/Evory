import {
  isValidShopItemCategory,
  isValidShopItemSpriteKey,
  isValidShopItemType,
  type ShopItemCategoryOption,
  type ShopItemTypeOption,
} from "@/lib/shop-metadata";

export type AdminShopItemInput = {
  name: string;
  description: string;
  type: ShopItemTypeOption;
  category: ShopItemCategoryOption;
  price: number;
  spriteKey: string;
  isActive: boolean;
};

export class AdminShopValidationError extends Error {}

type ErrorWithCode = {
  code?: unknown;
};

function validationError(message: string): never {
  throw new AdminShopValidationError(message);
}

export function parseAdminShopItemInput(body: unknown): AdminShopItemInput {
  if (!body || typeof body !== "object") {
    validationError("Invalid request body");
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const type = typeof input.type === "string" ? input.type.trim() : input.type;
  const category =
    typeof input.category === "string"
      ? input.category.trim()
      : input.category;
  const spriteKey =
    typeof input.spriteKey === "string" ? input.spriteKey.trim() : "";
  const { price, isActive } = input;

  if (!name) {
    validationError("name is required");
  }

  if (!isValidShopItemType(type)) {
    validationError("type is invalid");
  }

  if (!isValidShopItemCategory(category)) {
    validationError("category is invalid");
  }

  if (!Number.isInteger(price) || price < 0) {
    validationError("price must be a non-negative integer");
  }

  if (!spriteKey) {
    validationError("spriteKey is required");
  }

  if (!isValidShopItemSpriteKey(type, spriteKey)) {
    validationError("spriteKey is invalid");
  }

  if (typeof isActive !== "boolean") {
    validationError("isActive is required");
  }

  return {
    name,
    description,
    type,
    category,
    price,
    spriteKey,
    isActive,
  };
}

export function isAdminShopValidationError(
  error: unknown
): error is AdminShopValidationError {
  return error instanceof AdminShopValidationError || error instanceof SyntaxError;
}

export function isMissingShopItemError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as ErrorWithCode).code === "P2025"
  );
}
