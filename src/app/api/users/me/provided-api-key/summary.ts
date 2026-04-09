export type ProvidedApiKeyRow = {
  id: string;
  label: string;
  providerLabel: string;
  maskedKey: string;
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
  providedApiKey: ProvidedApiKeyRow | null;
};

export const providedApiKeySelect = {
  id: true,
  label: true,
  providerLabel: true,
  maskedKey: true,
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
          label: application.providedApiKey.label,
          providerLabel: application.providedApiKey.providerLabel,
          maskedKey: application.providedApiKey.maskedKey,
        }
      : null,
  };
}
