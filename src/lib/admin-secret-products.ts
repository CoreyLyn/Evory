export type AdminSecretProductInput = {
  name: string;
  description: string;
  productType: "SECRET_CREDENTIAL";
  price: number;
  isActive: boolean;
  displayConfig: Record<string, unknown>;
  fulfillmentConfig: Record<string, unknown>;
};

export type AdminSecretInventoryImportInput = {
  sourceLabel: string;
  note: string;
  secrets: string[];
};

export class AdminSecretProductValidationError extends Error {}

function validationError(message: string): never {
  throw new AdminSecretProductValidationError(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseAdminSecretProductInput(
  body: unknown
): AdminSecretProductInput {
  if (!body || typeof body !== "object") {
    validationError("Invalid request body");
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const productType =
    typeof input.productType === "string"
      ? input.productType.trim()
      : input.productType;
  const { price, isActive } = input;
  const displayConfig = isPlainObject(input.displayConfig)
    ? input.displayConfig
    : null;
  const fulfillmentConfig = isPlainObject(input.fulfillmentConfig)
    ? input.fulfillmentConfig
    : null;

  if (!name) {
    validationError("name is required");
  }

  if (productType !== "SECRET_CREDENTIAL") {
    validationError("productType is invalid");
  }

  if (typeof price !== "number" || !Number.isInteger(price) || price < 0) {
    validationError("price must be a non-negative integer");
  }

  if (typeof isActive !== "boolean") {
    validationError("isActive is required");
  }

  if (!displayConfig) {
    validationError("displayConfig is required");
  }

  if (!fulfillmentConfig) {
    validationError("fulfillmentConfig is required");
  }

  if (!isNonEmptyString(displayConfig.providerLabel)) {
    validationError("displayConfig.providerLabel is required");
  }

  if (
    displayConfig.usageInstructions !== undefined &&
    displayConfig.usageInstructions !== null &&
    !isNonEmptyString(displayConfig.usageInstructions)
  ) {
    validationError("displayConfig.usageInstructions must be a non-empty string");
  }

  if (typeof fulfillmentConfig.allowRepeatPurchase !== "boolean") {
    validationError("fulfillmentConfig.allowRepeatPurchase is required");
  }

  if (
    fulfillmentConfig.perAgentPurchaseLimit !== undefined &&
    fulfillmentConfig.perAgentPurchaseLimit !== null
  ) {
    if (
      typeof fulfillmentConfig.perAgentPurchaseLimit !== "number" ||
      !Number.isInteger(fulfillmentConfig.perAgentPurchaseLimit) ||
      fulfillmentConfig.perAgentPurchaseLimit < 1
    ) {
      validationError(
        "fulfillmentConfig.perAgentPurchaseLimit must be a positive integer"
      );
    }
  }

  return {
    name,
    description,
    productType: "SECRET_CREDENTIAL",
    price,
    isActive,
    displayConfig,
    fulfillmentConfig,
  };
}

export function parseAdminSecretInventoryImportInput(
  body: unknown
): AdminSecretInventoryImportInput {
  if (!body || typeof body !== "object") {
    validationError("Invalid request body");
  }

  const input = body as Record<string, unknown>;
  const sourceLabel =
    typeof input.sourceLabel === "string" ? input.sourceLabel.trim() : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  const secretsRaw = typeof input.secrets === "string" ? input.secrets : "";

  if (!sourceLabel) {
    validationError("sourceLabel is required");
  }

  const secrets = secretsRaw
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (secrets.length === 0) {
    validationError("secrets is required");
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of secrets) {
    if (!seen.has(value)) {
      seen.add(value);
      deduped.push(value);
    }
  }

  return {
    sourceLabel,
    note,
    secrets: deduped,
  };
}
