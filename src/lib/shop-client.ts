type PublicFetch = (input: string, init?: RequestInit) => Promise<Response>;
type AgentFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type ShopCurrencyType = "POINTS";

export type PublicShopCatalogEntryType = "cosmetic" | "secret_product";

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

export type PublicShopCatalogSecretProductEntry = {
  entryType: "secret_product";
  id: string;
  name: string;
  description: string;
  price: number;
  currencyType: ShopCurrencyType;
  providerLabel: string | null;
  usageInstructions: string | null;
  isInStock: boolean;
  availableInventoryCount: number;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit: number | null;
};

export type PublicShopCatalogEntry =
  | PublicShopCatalogCosmeticEntry
  | PublicShopCatalogSecretProductEntry;

export type AdminSecretProductRecord = {
  id: string;
  name: string;
  description: string;
  productType: "SECRET_CREDENTIAL";
  price: number;
  currencyType: "POINTS";
  isActive: boolean;
  displayConfig: {
    providerLabel?: string | null;
    usageInstructions?: string | null;
    [key: string]: unknown;
  };
  fulfillmentConfig: {
    allowRepeatPurchase?: boolean;
    perAgentPurchaseLimit?: number | null;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
};

export type SecretProductEnvelope = Pick<
  AdminSecretProductRecord,
  "id" | "name" | "description" | "price" | "productType"
> & {
  providerLabel: string | null;
  usageInstructions: string | null;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit: number | null;
  availableInventoryCount: number;
  isInStock: boolean;
};

export type AdminSecretProduct = AdminSecretProductRecord & {
  inventoryCount: number;
  orderCount: number;
};

export type SecretProductOrderStatus = "PENDING" | "FULFILLED" | "FAILED";

export type SecretProductOrderDelivery = {
  deliveredAt: string | null;
  secretInventoryId: string | null;
  maskedSecret: string | null;
};

export type AdminSecretProductOrder = {
  id: string;
  status: SecretProductOrderStatus;
  pricePaid: number;
  currencyType: ShopCurrencyType;
  deliveryChannel: "AGENT_CHAT";
  failureReason: string | null;
  createdAt: string;
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
  delivery: SecretProductOrderDelivery;
};

export type AgentSecretProductOrder = {
  id: string;
  status: SecretProductOrderStatus;
  pricePaid: number;
  currencyType: ShopCurrencyType;
  deliveryChannel: "AGENT_CHAT";
  failureReason: string | null;
  createdAt: string;
  fulfilledAt: string | null;
  product: {
    id: string;
    name: string;
    isActive: boolean;
  };
  delivery: SecretProductOrderDelivery;
};

export type AdminSecretProductCreateInput = {
  name: string;
  description: string;
  price: number;
  providerLabel: string;
  usageInstructions: string;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit?: number | null;
};

export type AdminSecretProductUpdateInput = AdminSecretProductCreateInput & {
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
  secretProducts: SecretProductEnvelope[];
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

function readNonNegativeInteger(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return undefined;
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
    record.entryType === "secret_product" ? "secret_product" : "cosmetic";

  const base = {
    id: requireString(record, "id", "shop catalog entry"),
    name: requireString(record, "name", "shop catalog entry"),
    description: requireString(record, "description", "shop catalog entry"),
    price: requireNumber(record, "price", "shop catalog entry"),
    currencyType: readCurrencyType(record, "shop catalog entry"),
  };

  if (entryType === "secret_product") {
    const availableInventoryCount =
      readNonNegativeInteger(record, "availableInventoryCount") ?? 0;
    const allowRepeatPurchase =
      readBoolean(record, "allowRepeatPurchase") ?? true;
    const perAgentPurchaseLimit = readPositiveIntegerOrNull(
      record,
      "perAgentPurchaseLimit"
    );
    const isInStock =
      readBoolean(record, "isInStock") ?? availableInventoryCount > 0;

    return {
      entryType,
      ...base,
      providerLabel: readStringOrNull(record, "providerLabel"),
      usageInstructions: readStringOrNull(record, "usageInstructions"),
      isInStock,
      availableInventoryCount,
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
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit?: number | null;
  isActive: boolean;
}) {
  const normalizedPrice = Number.isFinite(input.price)
    ? Math.max(0, Math.trunc(input.price))
    : 0;
  const usageInstructions = input.usageInstructions?.trim();
  const fulfillmentConfig: Record<string, unknown> = {
    allowRepeatPurchase: input.allowRepeatPurchase,
  };

  if (input.perAgentPurchaseLimit !== undefined) {
    fulfillmentConfig.perAgentPurchaseLimit = input.perAgentPurchaseLimit;
  }

  return {
    name: input.name,
    description: input.description,
    productType: "SECRET_CREDENTIAL" as const,
    price: normalizedPrice,
    isActive: input.isActive,
    displayConfig: {
      providerLabel: input.providerLabel,
      usageInstructions: usageInstructions || undefined,
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
