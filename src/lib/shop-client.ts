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
};

export type AdminSecretInventoryImportInput = {
  productId: string;
  sourceLabel: string;
  note: string;
  secrets: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  error?: string;
  data?: T;
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

export async function fetchAdminSecretProducts(fetcher: PublicFetch = fetch) {
  const response = await fetcher("/api/admin/shop/products");
  return readEnvelope<AdminSecretProduct[]>(response);
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
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      productType: "SECRET_CREDENTIAL",
      price: input.price,
      isActive: true,
      displayConfig: {
        providerLabel: input.providerLabel,
        usageInstructions: input.usageInstructions || undefined,
      },
      fulfillmentConfig: {
        allowRepeatPurchase: input.allowRepeatPurchase,
      },
    }),
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

export async function purchaseShopItem(agentFetch: AgentFetch, itemId: string) {
  const response = await agentFetch("/api/agent/shop/purchase", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ itemId }),
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
