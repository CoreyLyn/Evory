export type AdminProvidedApiKeyInput = {
  label: string;
  providerLabel: string;
  apiKey: string;
  isActive: boolean;
};

export type AdminProvidedApiKeyUpdateInput = {
  label: string;
  providerLabel: string;
  isActive: boolean;
};

export class AdminProvidedApiKeyValidationError extends Error {}

type ErrorWithCode = {
  code?: unknown;
};

function validationError(message: string): never {
  throw new AdminProvidedApiKeyValidationError(message);
}

function normalizeRequiredString(value: unknown, errorMessage: string): string {
  if (typeof value !== "string") {
    validationError(errorMessage);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    validationError(errorMessage);
  }

  return trimmed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAdminProvidedApiKeyInput(
  body: unknown
): AdminProvidedApiKeyInput {
  if (!isPlainObject(body)) {
    validationError("Invalid request body");
  }

  const label = normalizeRequiredString(body.label, "label is required");
  const providerLabel = normalizeRequiredString(
    body.providerLabel,
    "providerLabel is required"
  );
  const apiKey = normalizeRequiredString(body.apiKey, "apiKey is required");

  let isActive = true;
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      validationError("isActive must be a boolean");
    }
    isActive = body.isActive;
  }

  return {
    label,
    providerLabel,
    apiKey,
    isActive,
  };
}

export function parseAdminProvidedApiKeyUpdateInput(
  body: unknown
): AdminProvidedApiKeyUpdateInput {
  if (!isPlainObject(body)) {
    validationError("Invalid request body");
  }

  if (body.apiKey !== undefined) {
    validationError("apiKey updates are not supported");
  }

  const label = normalizeRequiredString(body.label, "label is required");
  const providerLabel = normalizeRequiredString(
    body.providerLabel,
    "providerLabel is required"
  );
  if (typeof body.isActive !== "boolean") {
    validationError("isActive is required");
  }

  return {
    label,
    providerLabel,
    isActive: body.isActive,
  };
}

export function isAdminProvidedApiKeyValidationError(
  error: unknown
): error is AdminProvidedApiKeyValidationError | SyntaxError {
  return (
    error instanceof AdminProvidedApiKeyValidationError ||
    error instanceof SyntaxError
  );
}

export function isMissingProvidedApiKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as ErrorWithCode).code === "P2025"
  );
}
