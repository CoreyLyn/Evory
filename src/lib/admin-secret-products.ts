export type AdminSecretProductInput = {
  name: string;
  description: string;
  productType: "SECRET_CREDENTIAL";
  price: number;
  isActive: boolean;
  displayConfig: {
    providerLabel: string;
    usageInstructions: string;
  };
  fulfillmentConfig: {
    repeatPurchasePolicy: string;
    perAgentPurchaseLimit: number | null;
  };
};

export type AdminSecretInventoryImportInput = {
  productId: string;
  sourceLabel: string;
  note: string;
  values: string[];
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
  const providerLabel =
    typeof input.providerLabel === "string" ? input.providerLabel.trim() : "";
  const usageInstructions =
    typeof input.usageInstructions === "string"
      ? input.usageInstructions.trim()
      : "";
  const repeatPurchasePolicy =
    typeof input.repeatPurchasePolicy === "string"
      ? input.repeatPurchasePolicy.trim()
      : "";
  const { price, isActive } = input;
  const perAgentPurchaseLimit = input.perAgentPurchaseLimit;

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

  if (!providerLabel) {
    validationError("providerLabel is required");
  }

  if (!usageInstructions) {
    validationError("usageInstructions is required");
  }

  if (!repeatPurchasePolicy) {
    validationError("repeatPurchasePolicy is required");
  }

  let parsedLimit: number | null = null;
  if (perAgentPurchaseLimit !== undefined && perAgentPurchaseLimit !== null) {
    if (
      typeof perAgentPurchaseLimit !== "number" ||
      !Number.isInteger(perAgentPurchaseLimit) ||
      perAgentPurchaseLimit < 1
    ) {
      validationError("perAgentPurchaseLimit must be a positive integer");
    }
    parsedLimit = perAgentPurchaseLimit;
  }

  return {
    name,
    description,
    productType: "SECRET_CREDENTIAL",
    price,
    isActive,
    displayConfig: {
      providerLabel,
      usageInstructions,
    },
    fulfillmentConfig: {
      repeatPurchasePolicy,
      perAgentPurchaseLimit: parsedLimit,
    },
  };
}

export function parseAdminSecretInventoryImportInput(
  body: unknown
): AdminSecretInventoryImportInput {
  if (!body || typeof body !== "object") {
    validationError("Invalid request body");
  }

  const input = body as Record<string, unknown>;
  const productId =
    typeof input.productId === "string" ? input.productId.trim() : "";
  const sourceLabel =
    typeof input.sourceLabel === "string" ? input.sourceLabel.trim() : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  const valuesRaw = typeof input.values === "string" ? input.values : "";

  if (!productId) {
    validationError("productId is required");
  }

  if (!sourceLabel) {
    validationError("sourceLabel is required");
  }

  const values = valuesRaw.split(/\r?\n/).map((value) => value.trim());

  if (values.some((value) => !value)) {
    validationError("values must not include empty lines");
  }

  const seen = new Set(values);
  if (seen.size !== values.length) {
    validationError("values must not include duplicate entries");
  }

  return {
    productId,
    sourceLabel,
    note,
    values,
  };
}
