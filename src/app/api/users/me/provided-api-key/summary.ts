import { decryptSecretValue } from "@/lib/secret-crypto";
import { deriveMaskedProvidedApiKey } from "@/lib/provided-api-key-presentation";

export type ProvidedApiKeyRow = {
  id: string;
  maskedKey: string;
  encryptedKey: string;
};

export type ApplicationRow = {
  id: string;
  status: "PENDING" | "FULFILLED" | "FAILED";
  requestedAt: Date;
  fulfilledAt: Date | null;
  failureReason: string | null;
  providedApiKey: ProvidedApiKeyRow | null;
};

export type UserProvidedApiKeySummary = {
  status: "NONE" | ApplicationRow["status"];
  application: {
    id: string;
    status: ApplicationRow["status"];
    requestedAt: string;
    fulfilledAt: string | null;
    failureReason: string | null;
  } | null;
  providedApiKey: {
    id: string;
    maskedKey: string;
    copyValue: string;
  } | null;
};

export const providedApiKeySelect = {
  id: true,
  maskedKey: true,
  encryptedKey: true,
} as const;

export const applicationSummarySelect = {
  id: true,
  status: true,
  requestedAt: true,
  fulfilledAt: true,
  failureReason: true,
  providedApiKey: {
    select: providedApiKeySelect,
  },
} as const;

export function toSummary(
  application: ApplicationRow | null
): UserProvidedApiKeySummary {
  if (!application) {
    return {
      status: "NONE",
      application: null,
      providedApiKey: null,
    };
  }

  return {
    status: application.status,
    application: {
      id: application.id,
      status: application.status,
      requestedAt: application.requestedAt.toISOString(),
      fulfilledAt: application.fulfilledAt?.toISOString() ?? null,
      failureReason: application.failureReason ?? null,
    },
        providedApiKey: application.providedApiKey
      ? {
          id: application.providedApiKey.id,
          maskedKey: deriveMaskedProvidedApiKey(application.providedApiKey),
          copyValue: decryptSecretValue(application.providedApiKey.encryptedKey),
        }
      : null,
  };
}
