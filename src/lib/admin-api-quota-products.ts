import type { Prisma } from "@/generated/prisma/client";

export type AdminApiQuotaProductInput = {
  name: string;
  description: string;
  productType: "API_QUOTA";
  price: number;
  isActive: boolean;
  displayConfig: Prisma.InputJsonObject;
  fulfillmentConfig: Prisma.InputJsonObject;
};

export class AdminApiQuotaProductValidationError extends Error {}

function validationError(message: string): never {
  throw new AdminApiQuotaProductValidationError(message);
}

function isPlainObject(value: unknown): value is Prisma.InputJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNonEmptyString(
  value: unknown,
  errorMessage: string
): string {
  if (typeof value !== "string") {
    validationError(errorMessage);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    validationError(errorMessage);
  }
  return trimmed;
}

function normalizeOptionalNonEmptyString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    validationError("displayConfig.usageInstructions must be a non-empty string");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    validationError("displayConfig.usageInstructions must be a non-empty string");
  }
  return trimmed;
}

function normalizePositiveInteger(value: unknown, errorMessage: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    validationError(errorMessage);
  }
  return value;
}

export function isAdminApiQuotaProductValidationError(
  error: unknown
): error is AdminApiQuotaProductValidationError | SyntaxError {
  return (
    error instanceof AdminApiQuotaProductValidationError ||
    error instanceof SyntaxError
  );
}

export function parseAdminApiQuotaProductInput(
  body: unknown
): AdminApiQuotaProductInput {
  if (!isPlainObject(body)) {
    validationError("Invalid request body");
  }

  const input = body as Record<string, unknown>;
  const name = normalizeNonEmptyString(input.name, "name is required");
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const productType =
    typeof input.productType === "string"
      ? input.productType.trim()
      : input.productType;
  const { price, isActive } = input;

  if (productType !== "API_QUOTA") {
    validationError("productType is invalid");
  }

  if (typeof price !== "number" || !Number.isInteger(price) || price < 0) {
    validationError("price must be a non-negative integer");
  }

  if (typeof isActive !== "boolean") {
    validationError("isActive is required");
  }

  if (!isPlainObject(input.displayConfig)) {
    validationError("displayConfig is required");
  }
  if (!isPlainObject(input.fulfillmentConfig)) {
    validationError("fulfillmentConfig is required");
  }

  const providerLabel = normalizeNonEmptyString(
    input.displayConfig.providerLabel,
    "displayConfig.providerLabel is required"
  );
  const quotaUnitLabel = normalizeNonEmptyString(
    input.displayConfig.quotaUnitLabel,
    "displayConfig.quotaUnitLabel is required"
  );
  const usageInstructions = normalizeOptionalNonEmptyString(
    input.displayConfig.usageInstructions
  );

  const quotaAmount = normalizePositiveInteger(
    input.fulfillmentConfig.quotaAmount,
    "fulfillmentConfig.quotaAmount must be a positive integer"
  );
  if (typeof input.fulfillmentConfig.allowRepeatPurchase !== "boolean") {
    validationError("fulfillmentConfig.allowRepeatPurchase is required");
  }
  const allowRepeatPurchase = input.fulfillmentConfig.allowRepeatPurchase;

  let perAgentPurchaseLimit: number | undefined;
  if (
    input.fulfillmentConfig.perAgentPurchaseLimit !== undefined &&
    input.fulfillmentConfig.perAgentPurchaseLimit !== null
  ) {
    perAgentPurchaseLimit = normalizePositiveInteger(
      input.fulfillmentConfig.perAgentPurchaseLimit,
      "fulfillmentConfig.perAgentPurchaseLimit must be a positive integer"
    );
  }

  return {
    name,
    description,
    productType: "API_QUOTA",
    price,
    isActive,
    displayConfig: {
      providerLabel,
      quotaUnitLabel,
      ...(usageInstructions ? { usageInstructions } : {}),
    },
    fulfillmentConfig: {
      quotaAmount,
      allowRepeatPurchase,
      ...(perAgentPurchaseLimit !== undefined ? { perAgentPurchaseLimit } : {}),
    },
  };
}
