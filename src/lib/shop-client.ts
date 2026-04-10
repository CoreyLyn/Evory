type PublicFetch = (input: string, init?: RequestInit) => Promise<Response>;
type AgentFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type ShopCurrencyType = "POINTS";

export type PublicShopCatalogEntryType = "cosmetic" | "api_quota_product";

export type PublicShopCatalogCosmeticEntry = {
  entryType: "cosmetic";
  id: string;
  name: string;
  description: string;
  price: number;
  currencyType: ShopCurrencyType;
  type: string;
  category: string;
  spriteKey: string;
};

export type PublicShopCatalogApiQuotaProductEntry = {
  entryType: "api_quota_product";
  id: string;
  name: string;
  description: string;
  price: number;
  currencyType: ShopCurrencyType;
  providerLabel: string | null;
  usageInstructions: string | null;
  quotaAmount: number;
  quotaUnitLabel: string;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit: number | null;
};

export type PublicShopCatalogEntry =
  | PublicShopCatalogCosmeticEntry
  | PublicShopCatalogApiQuotaProductEntry;

export type AdminSecretProductRecord = {
  id: string;
  name: string;
  description: string;
  productType: "API_QUOTA";
  price: number;
  currencyType: "POINTS";
  isActive: boolean;
  displayConfig: {
    providerLabel?: string | null;
    usageInstructions?: string | null;
    quotaUnitLabel?: string | null;
    [key: string]: unknown;
  };
  fulfillmentConfig: {
    quotaAmount?: number;
    allowRepeatPurchase?: boolean;
    perAgentPurchaseLimit?: number | null;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
};

export type ApiQuotaProductEnvelope = {
  id: string;
  name: string;
  description: string;
  price: number;
  productType: "API_QUOTA";
  entryType: "api_quota_product";
  providerLabel: string | null;
  usageInstructions: string | null;
  quotaAmount: number;
  quotaUnitLabel: string;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit: number | null;
};

export type AdminSecretProduct = AdminSecretProductRecord & {
  inventoryCount: number;
  orderCount: number;
};

export type AdminProvidedApiKey = {
  id: string;
  label: string;
  providerLabel: string;
  maskedKey: string;
  isActive: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type SecretProductOrderStatus = "PENDING" | "FULFILLED" | "FAILED";

export type ApiQuotaOrderProvidedApiKey = {
  id: string;
  label: string;
  maskedKey: string;
  providerLabel: string;
};

export type UserProvidedApiKeySummaryStatus =
  | "NONE"
  | "PENDING"
  | "FULFILLED"
  | "FAILED";

export type UserProvidedApiKeySummary = {
  status: UserProvidedApiKeySummaryStatus;
  application: {
    id: string;
    status: Exclude<UserProvidedApiKeySummaryStatus, "NONE">;
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

export type UserApiBaseUrls = {
  openAiBaseUrl: string | null;
  anthropicBaseUrl: string | null;
};

export type AdminSecretProductOrder = {
  id: string;
  status: SecretProductOrderStatus;
  pricePaid: number;
  currencyType: ShopCurrencyType;
  deliveryChannel: "AGENT_CHAT";
  failureReason: string | null;
  quota: {
    amount: number;
    unit: string;
  };
  createdAt: string;
  confirmedAt: string | null;
  fulfilledAt: string | null;
  product: {
    id: string;
    name: string;
    isActive: boolean;
  };
  buyer: {
    agentId: string;
    name: string;
    type: string;
    ownerUserId: string | null;
  };
  providedApiKey: ApiQuotaOrderProvidedApiKey | null;
};

export type AdminApiKeyApplicationStatus = "PENDING" | "FULFILLED" | "FAILED";

export type AdminApiKeyApplication = {
  id: string;
  status: AdminApiKeyApplicationStatus;
  requestedAt: string;
  fulfilledAt: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  providedApiKey: {
    id: string;
    label: string;
    maskedKey: string;
    isActive: boolean;
  } | null;
};

export type AdminApiKeyApplicationFulfillment = {
  id: string;
  status: AdminApiKeyApplicationStatus;
  providedApiKeyId: string | null;
  fulfilledByUserId: string | null;
  fulfilledAt: string | null;
};

export type AgentSecretProductOrder = {
  id: string;
  status: SecretProductOrderStatus;
  pricePaid: number;
  currencyType: ShopCurrencyType;
  deliveryChannel: "AGENT_CHAT";
  failureReason: string | null;
  quota: {
    amount: number;
    unit: string;
  };
  createdAt: string;
  confirmedAt: string | null;
  fulfilledAt: string | null;
  product: {
    id: string;
    name: string;
    isActive: boolean;
  };
  providedApiKey: ApiQuotaOrderProvidedApiKey | null;
};

export type AdminSecretProductCreateInput = {
  name: string;
  description: string;
  price: number;
  providerLabel: string;
  usageInstructions: string;
  quotaAmount: number;
  quotaUnitLabel: string;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit?: number | null;
};

export type AdminSecretProductUpdateInput = AdminSecretProductCreateInput & {
  isActive: boolean;
};

export type AdminProvidedApiKeyCreateInput = {
  label: string;
  providerLabel?: string | null;
  apiKey: string;
  isActive?: boolean;
};

export type AdminProvidedApiKeyUpdateInput = {
  label: string;
  providerLabel?: string | null;
  isActive: boolean;
};

export type AdminSecretInventoryImportInput = {
  productId: string;
  sourceLabel: string;
  note: string;
  secrets: string;
};

export type SecretProductOrderFilters = {
  productId?: string;
  status?: SecretProductOrderStatus;
};

export type AdminSecretProductOrderFilters = SecretProductOrderFilters & {
  buyerAgentId?: string;
};

export type ShopPurchaseInput =
  | string
  | { itemId: string }
  | { productId: string };

type ApiEnvelope<T> = {
  success?: boolean;
  error?: string;
  data?: T;
};

export type AgentShopCatalog = {
  cosmetics: Array<Record<string, unknown>>;
  apiQuotaProducts: ApiQuotaProductEnvelope[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  context: string
): string {
  const value = record[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Invalid ${context}: missing ${key}`);
  }
  return value;
}

function requireNumber(
  record: Record<string, unknown>,
  key: string,
  context: string
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${context}: missing ${key}`);
  }
  return value;
}

function readStringOrNull(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readStringOrDefault(
  record: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function readPositiveIntegerOrNull(
  record: Record<string, unknown>,
  key: string
): number | null {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

function requirePositiveInteger(
  record: Record<string, unknown>,
  key: string,
  context: string
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${context}: missing ${key}`);
  }
  return value;
}

function readCurrencyType(
  record: Record<string, unknown>,
  context: string
): ShopCurrencyType {
  const value = record.currencyType;

  // Back-compat: older/public endpoints may omit currencyType entirely.
  if (value === undefined) return "POINTS";
  if (value === "POINTS") return "POINTS";

  throw new Error(`Invalid ${context}: unexpected currencyType`);
}

function normalizePublicShopCatalogEntry(rawEntry: unknown): PublicShopCatalogEntry {
  const record = asRecord(rawEntry);
  if (!record) {
    throw new Error("Invalid shop catalog entry");
  }

  const entryType =
    record.entryType === "api_quota_product" || record.entryType === "secret_product"
      ? "api_quota_product"
      : "cosmetic";

  const base = {
    id: requireString(record, "id", "shop catalog entry"),
    name: requireString(record, "name", "shop catalog entry"),
    description: readStringOrDefault(record, "description", ""),
    price: requireNumber(record, "price", "shop catalog entry"),
    currencyType: readCurrencyType(record, "shop catalog entry"),
  };

  if (entryType === "api_quota_product") {
    const allowRepeatPurchase =
      readBoolean(record, "allowRepeatPurchase") ?? true;
    const perAgentPurchaseLimit = readPositiveIntegerOrNull(
      record,
      "perAgentPurchaseLimit"
    );

    return {
      entryType,
      ...base,
      providerLabel: readStringOrNull(record, "providerLabel"),
      usageInstructions: readStringOrNull(record, "usageInstructions"),
      quotaAmount: requirePositiveInteger(record, "quotaAmount", "shop catalog entry"),
      quotaUnitLabel: requireString(record, "quotaUnitLabel", "shop catalog entry"),
      allowRepeatPurchase,
      perAgentPurchaseLimit,
    };
  }

  return {
    entryType,
    ...base,
    type: requireString(record, "type", "cosmetic catalog entry"),
    category: requireString(record, "category", "cosmetic catalog entry"),
    spriteKey: requireString(record, "spriteKey", "cosmetic catalog entry"),
  };
}

function normalizePublicShopCatalog(raw: unknown): PublicShopCatalogEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error("Invalid shop catalog");
  }
  return raw.map((entry) => normalizePublicShopCatalogEntry(entry));
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !json.success || json.data === undefined || json.data === null) {
    throw new Error(json.error ?? "Shop request failed");
  }

  return json.data;
}

function buildQueryString(
  filters: Record<string, string | undefined>
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value.length > 0) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function fetchShopItems(
  fetcher: PublicFetch = fetch
): Promise<PublicShopCatalogEntry[]> {
  const response = await fetcher("/api/points/shop");
  const raw = await readEnvelope<unknown>(response);
  return normalizePublicShopCatalog(raw);
}

export async function fetchAgentShopCatalog(agentFetch: AgentFetch) {
  const response = await agentFetch("/api/agent/shop");
  return readEnvelope<AgentShopCatalog>(response);
}

export async function fetchAdminSecretProducts(fetcher: PublicFetch = fetch) {
  const response = await fetcher("/api/admin/shop/products");
  return readEnvelope<AdminSecretProduct[]>(response);
}

export async function fetchAdminProvidedApiKeys(fetcher: PublicFetch = fetch) {
  const response = await fetcher("/api/admin/shop/api-keys");
  return readEnvelope<AdminProvidedApiKey[]>(response);
}

export async function fetchAdminApiKeyApplications(fetcher: PublicFetch = fetch) {
  const response = await fetcher("/api/admin/shop/api-key-applications");
  return readEnvelope<AdminApiKeyApplication[]>(response);
}

export async function fetchUserProvidedApiKeySummary(
  fetcher: PublicFetch = fetch
) {
  const response = await fetcher("/api/users/me/provided-api-key");
  return readEnvelope<UserProvidedApiKeySummary>(response);
}

export async function createUserProvidedApiKeyApplication(
  fetcher: PublicFetch = fetch
) {
  // Browser/same-origin usage only: relies on Origin/Referer headers set by the user agent.
  const response = await fetcher("/api/users/me/provided-api-key/applications", {
    method: "POST",
  });
  return readEnvelope<UserProvidedApiKeySummary>(response);
}

export async function fetchUserApiBaseUrls(
  fetcher: PublicFetch = fetch
) {
  const response = await fetcher("/api/site-config/base-urls");
  return readEnvelope<UserApiBaseUrls>(response);
}

export async function fetchAdminSecretProductOrders(
  fetcher: PublicFetch = fetch,
  filters: AdminSecretProductOrderFilters = {}
) {
  const response = await fetcher(
    `/api/admin/shop/orders${buildQueryString({
      productId: filters.productId,
      buyerAgentId: filters.buyerAgentId,
      status: filters.status,
    })}`
  );

  return readEnvelope<AdminSecretProductOrder[]>(response);
}

export async function fetchAgentSecretProductOrders(
  agentFetch: AgentFetch,
  filters: SecretProductOrderFilters = {}
) {
  const response = await agentFetch(
    `/api/agent/shop/orders${buildQueryString({
      productId: filters.productId,
      status: filters.status,
    })}`
  );

  return readEnvelope<AgentSecretProductOrder[]>(response);
}

function buildAdminSecretProductPayload(input: {
  name: string;
  description: string;
  price: number;
  providerLabel: string;
  usageInstructions: string;
  quotaAmount: number;
  quotaUnitLabel: string;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit?: number | null;
  isActive: boolean;
}) {
  const normalizedPrice = Number.isFinite(input.price)
    ? Math.max(0, Math.trunc(input.price))
    : 0;
  const normalizedQuotaAmount =
    Number.isFinite(input.quotaAmount) ? Math.max(1, Math.trunc(input.quotaAmount)) : 1;
  const usageInstructions = input.usageInstructions?.trim();
  const fulfillmentConfig: Record<string, unknown> = {
    quotaAmount: normalizedQuotaAmount,
    allowRepeatPurchase: input.allowRepeatPurchase,
  };

  if (input.perAgentPurchaseLimit !== undefined) {
    fulfillmentConfig.perAgentPurchaseLimit = input.perAgentPurchaseLimit;
  }

  return {
    name: input.name,
    description: input.description,
    productType: "API_QUOTA" as const,
    price: normalizedPrice,
    isActive: input.isActive,
    displayConfig: {
      providerLabel: input.providerLabel,
      usageInstructions: usageInstructions || undefined,
      quotaUnitLabel: input.quotaUnitLabel,
    },
    fulfillmentConfig,
  };
}

export async function createAdminSecretProduct(
  fetcher: PublicFetch,
  input: AdminSecretProductCreateInput
) {
  const response = await fetcher("/api/admin/shop/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildAdminSecretProductPayload({
        ...input,
        perAgentPurchaseLimit: input.perAgentPurchaseLimit ?? undefined,
        isActive: true,
      })
    ),
  });

  return readEnvelope<AdminSecretProductRecord>(response);
}

export async function updateAdminSecretProduct(
  fetcher: PublicFetch,
  productId: string,
  input: AdminSecretProductUpdateInput
) {
  const response = await fetcher(`/api/admin/shop/products/${productId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildAdminSecretProductPayload(input)),
  });

  return readEnvelope<AdminSecretProductRecord>(response);
}

export async function createAdminProvidedApiKey(
  fetcher: PublicFetch,
  input: AdminProvidedApiKeyCreateInput
) {
  const response = await fetcher("/api/admin/shop/api-keys", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      label: input.label,
      providerLabel: input.providerLabel ?? null,
      apiKey: input.apiKey,
      isActive: input.isActive ?? true,
    }),
  });

  return readEnvelope<AdminProvidedApiKey>(response);
}

export async function updateAdminProvidedApiKey(
  fetcher: PublicFetch,
  keyId: string,
  input: AdminProvidedApiKeyUpdateInput
) {
  const response = await fetcher(`/api/admin/shop/api-keys/${keyId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      label: input.label,
      providerLabel: input.providerLabel ?? null,
      isActive: input.isActive,
    }),
  });

  return readEnvelope<AdminProvidedApiKey>(response);
}

export async function fulfillAdminQuotaOrder(
  fetcher: PublicFetch,
  orderId: string
) {
  const response = await fetcher(`/api/admin/shop/orders/${orderId}/fulfill`, {
    method: "POST",
  });

  return readEnvelope<Record<string, unknown>>(response);
}

export async function fulfillAdminApiKeyApplication(
  fetcher: PublicFetch,
  applicationId: string,
  input: { providedApiKeyId: string }
) {
  const response = await fetcher(
    `/api/admin/shop/api-key-applications/${applicationId}/fulfill`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );

  return readEnvelope<AdminApiKeyApplicationFulfillment>(response);
}

export async function importAdminSecretInventory(
  fetcher: PublicFetch,
  input: AdminSecretInventoryImportInput
) {
  const response = await fetcher(`/api/admin/shop/products/${input.productId}/inventory`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sourceLabel: input.sourceLabel,
      note: input.note,
      secrets: input.secrets,
    }),
  });

  return readEnvelope<{ importBatchId: string; importCount: number }>(response);
}

export async function fetchPointsBalance(agentFetch: AgentFetch) {
  const response = await agentFetch("/api/agent/points/balance");
  const data = await readEnvelope<{ balance: number }>(response);
  return data.balance;
}

export async function fetchAgentInventory(agentFetch: AgentFetch) {
  const response = await agentFetch("/api/agent/inventory");
  return readEnvelope<Array<Record<string, unknown>>>(response);
}

function normalizeShopPurchaseInput(input: ShopPurchaseInput) {
  if (typeof input === "string") {
    return { itemId: input };
  }

  if ("itemId" in input && typeof input.itemId === "string") {
    return { itemId: input.itemId };
  }

  if ("productId" in input && typeof input.productId === "string") {
    return { productId: input.productId };
  }

  throw new Error("itemId or productId is required");
}

export async function purchaseShopItem(agentFetch: AgentFetch, input: ShopPurchaseInput) {
  const response = await agentFetch("/api/agent/shop/purchase", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(normalizeShopPurchaseInput(input)),
  });

  return readEnvelope<Record<string, unknown>>(response);
}

export async function equipInventoryItem(agentFetch: AgentFetch, itemId: string) {
  const response = await agentFetch("/api/agent/equipment", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ itemId }),
  });

  return readEnvelope<Record<string, unknown>>(response);
}
