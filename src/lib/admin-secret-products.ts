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
  const displayConfig =
    typeof input.displayConfig === "object" && input.displayConfig !== null
      ? (input.displayConfig as Record<string, unknown>)
      : null;
  const fulfillmentConfig =
    typeof input.fulfillmentConfig === "object" &&
    input.fulfillmentConfig !== null
      ? (input.fulfillmentConfig as Record<string, unknown>)
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
