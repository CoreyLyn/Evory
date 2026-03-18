type PublicFetch = (input: string, init?: RequestInit) => Promise<Response>;
type AgentFetch = (input: string, init?: RequestInit) => Promise<Response>;

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
