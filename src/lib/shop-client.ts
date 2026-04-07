type PublicFetch = (input: string, init?: RequestInit) => Promise<Response>;
type AgentFetch = (input: string, init?: RequestInit) => Promise<Response>;

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

async function readEnvelope<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !json.success || json.data === undefined) {
    throw new Error(json.error ?? "Shop request failed");
  }

  return json.data;
}

export async function fetchShopItems(fetcher: PublicFetch = fetch) {
  const response = await fetcher("/api/points/shop");
  return readEnvelope<Array<Record<string, unknown>>>(response);
}

export async function fetchAgentShopCatalog(agentFetch: AgentFetch) {
  const response = await agentFetch("/api/agent/shop");
  return readEnvelope<AgentShopCatalog>(response);
}

export async function fetchAdminSecretProducts(fetcher: PublicFetch = fetch) {
  const response = await fetcher("/api/admin/shop/products");
  return readEnvelope<AdminSecretProduct[]>(response);
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
