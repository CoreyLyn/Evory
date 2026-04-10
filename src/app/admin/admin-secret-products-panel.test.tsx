import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminSecretProduct } from "@/lib/shop-client";

import {
  AdminSecretProductsPanel,
  normalizeInventoryProductId,
  performAdminSecretProductMutation,
} from "./admin-secret-products-panel";

type Root = ReturnType<typeof ReactDOMClient.createRoot>;

type MinimalElementNode = {
  nodeType: number;
  tagName: string;
  ownerDocument: MinimalDocument;
  namespaceURI: string;
  style: Record<string, never>;
  attributes: Map<string, string>;
  children: Array<MinimalNode>;
  parentNode: MinimalElementNode | null;
  textContent: string;
  listeners: Map<string, Array<(event: MinimalEvent) => void>>;
  options?: MinimalElementNode[];
  selectedIndex?: number;
  value?: string;
  appendChild: (child: MinimalNode) => MinimalNode;
  removeChild: (child: MinimalNode) => MinimalNode;
  insertBefore: (child: MinimalNode) => MinimalNode;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  addEventListener: (type: string, listener: (event: MinimalEvent) => void) => void;
  removeEventListener: (type: string, listener: (event: MinimalEvent) => void) => void;
  dispatchEvent: (event: MinimalEvent) => boolean;
};

type MinimalTextNode = {
  nodeType: number;
  textContent: string;
  ownerDocument: MinimalDocument;
  parentNode: MinimalElementNode | null;
};

type MinimalNode = MinimalElementNode | MinimalTextNode;

type MinimalEvent = {
  type: string;
  target: MinimalElementNode;
};

type MinimalDocument = {
  nodeType: number;
  documentElement: { namespaceURI: string };
  defaultView: MinimalWindow | null;
  activeElement: null;
  addEventListener: () => void;
  removeEventListener: () => void;
  createElement: (tagName: string) => MinimalElementNode;
  createElementNS: (ns: string, tagName: string) => MinimalElementNode;
  createTextNode: (text: string) => MinimalTextNode;
};

type MinimalWindow = {
  document: MinimalDocument;
  navigator: { userAgent: string };
  HTMLElement: typeof globalThis.HTMLElement;
  HTMLIFrameElement: typeof globalThis.HTMLIFrameElement;
  Node: typeof globalThis.Node;
  Event: typeof globalThis.Event;
};

function createProduct(overrides: Record<string, unknown> = {}): AdminSecretProduct {
  return {
    id: "product-1",
    name: "Provider Quota Pack",
    description: "10k tokens",
    productType: "API_QUOTA",
    price: 300,
    currencyType: "POINTS",
    isActive: true,
    displayConfig: {
      providerLabel: "Provider",
      usageInstructions: "Store securely",
      quotaUnitLabel: "tokens",
    },
    fulfillmentConfig: {
      quotaAmount: 10000,
      allowRepeatPurchase: true,
      perAgentPurchaseLimit: null,
    },
    inventoryCount: 0,
    orderCount: 1,
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-02T00:00:00.000Z",
    ...overrides,
  };
}

test("AdminSecretProductsPanel renders the api key base url settings card", () => {
  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={(key) => key}
      products={[createProduct()]}
      loading={false}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /admin\.products\.baseUrls\.title/);
  assert.match(html, /admin\.products\.baseUrls\.openAiLabel/);
  assert.match(html, /admin\.products\.baseUrls\.anthropicLabel/);
  assert.match(html, /admin\.products\.baseUrls\.save/);
});

function setGlobalValue(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

function installMinimalDom() {
  const document = {
    nodeType: 9,
    documentElement: { namespaceURI: "http://www.w3.org/1999/xhtml" },
    defaultView: null as MinimalWindow | null,
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
    createElement(tagName: string) {
      return createElementNode(document, tagName);
    },
    createElementNS(_ns: string, tagName: string) {
      return createElementNode(document, tagName);
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: text, ownerDocument: document, parentNode: null };
    },
  } satisfies MinimalDocument;

  const rootNode = createElementNode(document, "div");

  const window = {
    document,
    navigator: { userAgent: "node" },
    HTMLElement: function HTMLElement() {},
    HTMLIFrameElement: function HTMLIFrameElement() {},
    Node: function Node() {},
    Event: function Event() {},
  } satisfies MinimalWindow;

  document.defaultView = window;

  setGlobalValue("window", window);
  setGlobalValue("document", document);
  setGlobalValue("navigator", window.navigator);
  setGlobalValue("HTMLElement", window.HTMLElement);
  setGlobalValue("HTMLIFrameElement", window.HTMLIFrameElement);
  setGlobalValue("Node", window.Node);
  setGlobalValue("Event", window.Event);
  setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);

  return { rootNode };
}

function createElementNode(ownerDocument: MinimalDocument, tagName: string): MinimalElementNode {
  const upperTag = tagName.toUpperCase();
  const node: MinimalElementNode = {
    nodeType: 1,
    tagName: upperTag,
    ownerDocument,
    namespaceURI: "http://www.w3.org/1999/xhtml",
    style: {},
    attributes: new Map<string, string>(),
    children: [],
    parentNode: null,
    textContent: "",
    listeners: new Map<string, Array<(event: MinimalEvent) => void>>(),
    appendChild(child: MinimalNode) {
      if ("parentNode" in child) {
        child.parentNode = this;
      }
      this.children.push(child);
      if (this.tagName === "SELECT" && child.nodeType === 1 && child.tagName === "OPTION") {
        this.options = this.options ?? [];
        this.options.push(child);
        if (this.selectedIndex === undefined) {
          this.selectedIndex = 0;
        }
      }
      return child;
    },
    removeChild(child: MinimalNode) {
      this.children = this.children.filter((item) => item !== child);
      if ("parentNode" in child) {
        child.parentNode = null;
      }
      return child;
    },
    insertBefore(child: MinimalNode) {
      if ("parentNode" in child) {
        child.parentNode = this;
      }
      this.children.push(child);
      if (this.tagName === "SELECT" && child.nodeType === 1 && child.tagName === "OPTION") {
        this.options = this.options ?? [];
        this.options.push(child);
        if (this.selectedIndex === undefined) {
          this.selectedIndex = 0;
        }
      }
      return child;
    },
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    },
    removeAttribute(name: string) {
      this.attributes.delete(name);
    },
    addEventListener(type: string, listener: (event: MinimalEvent) => void) {
      const existing = this.listeners.get(type) ?? [];
      existing.push(listener);
      this.listeners.set(type, existing);
    },
    removeEventListener(type: string, listener: (event: MinimalEvent) => void) {
      const existing = this.listeners.get(type);
      if (!existing) {
        return;
      }
      this.listeners.set(
        type,
        existing.filter((item) => item !== listener)
      );
    },
    dispatchEvent(event: MinimalEvent) {
      const listeners = this.listeners.get(event.type) ?? [];
      for (const listener of listeners) {
        listener(event);
      }
      return true;
    },
  };

  if (upperTag === "SELECT") {
    node.options = [];
    node.selectedIndex = -1;
    node.value = "";
  }

  return node;
}

function getNodeText(node: MinimalNode): string {
  if (node.nodeType === 3) {
    return node.textContent;
  }
  return [node.textContent, ...node.children.map(getNodeText)].join("");
}

function findElements(
  node: MinimalNode,
  predicate: (element: MinimalElementNode) => boolean,
  matches: MinimalElementNode[] = []
) {
  if (node.nodeType === 1) {
    if (predicate(node)) {
      matches.push(node);
    }
    for (const child of node.children) {
      findElements(child, predicate, matches);
    }
  }
  return matches;
}

async function renderPanelWithDom(props: {
  products: AdminSecretProduct[];
  fetchMock: (input: string, init?: RequestInit) => Promise<Response>;
  onRefresh: () => Promise<void>;
}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNavigator = globalThis.navigator;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousHTMLIFrameElement = globalThis.HTMLIFrameElement;
  const previousNode = globalThis.Node;
  const previousEvent = globalThis.Event;
  const previousFetch = globalThis.fetch;
  const previousActEnvironment = (globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }).IS_REACT_ACT_ENVIRONMENT;

  const { rootNode } = installMinimalDom();
  globalThis.fetch = props.fetchMock as typeof fetch;

  const root: Root = ReactDOMClient.createRoot(rootNode as never);

  await act(async () => {
    root.render(
      <AdminSecretProductsPanel
        t={(key) => key}
        products={props.products}
        loading={false}
        onRefresh={props.onRefresh}
        onError={() => undefined}
        onSuccess={() => undefined}
      />
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    setGlobalValue("window", previousWindow);
    setGlobalValue("document", previousDocument);
    setGlobalValue("navigator", previousNavigator);
    setGlobalValue("HTMLElement", previousHTMLElement);
    setGlobalValue("HTMLIFrameElement", previousHTMLIFrameElement);
    setGlobalValue("Node", previousNode);
    setGlobalValue("Event", previousEvent);
    setGlobalValue("IS_REACT_ACT_ENVIRONMENT", previousActEnvironment);
    globalThis.fetch = previousFetch;
  };

  return { rootNode, cleanup };
}

test("AdminSecretProductsPanel renders quota, provided key, bindings, and pending order sections", () => {
  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={(key) => key}
      products={[createProduct()]}
      loading={false}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /admin\.products\.form\.quotaAmount/);
  assert.match(html, /admin\.products\.form\.quotaUnitLabel/);
  assert.match(html, /admin\.products\.keys\.title/);
  assert.match(html, /admin\.products\.bindings\.title/);
  assert.match(html, /admin\.products\.orders\.pendingTitle/);
  assert.doesNotMatch(html, /admin\.products\.inventory\.secrets/);
});

test("AdminSecretProductsPanel renders provider presets, purchase policy controls, and a storefront preview", () => {
  const t = (key: string) => {
    switch (key) {
      case "admin.products.form.providerPreset":
        return "Provider preset";
      case "admin.products.form.purchasePolicy":
        return "Purchase policy";
      case "admin.products.preview.title":
        return "Storefront preview";
      case "admin.products.preview.policy":
        return "Policy";
      case "admin.products.policy.repeat":
        return "Repeat purchase";
      case "common.pts":
        return "pts";
      default:
        return key;
    }
  };

  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={t as never}
      products={[createProduct()]}
      loading={false}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /Provider preset/);
  assert.match(html, /Purchase policy/);
  assert.match(html, /Storefront preview/);
  assert.match(html, /OpenAI/);
  assert.match(html, /10000 tokens/);
  assert.match(html, /Repeat purchase/);
  assert.match(html, /0 pts/);
  assert.doesNotMatch(html, /admin\.products\.form\.allowRepeatPurchase/);
});

test("AdminSecretProductsPanel loads keys and can fulfill a pending order", async () => {
  const products = [createProduct()];
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  let refreshCount = 0;

  const fetchMock = async (input: string, init?: RequestInit) => {
    requests.push({ input, init });

    if (input === "/api/admin/shop/api-keys") {
      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "key-1",
              label: "Primary OpenAI key",
              providerLabel: "OpenAI",
              maskedKey: "sk-****1234",
              isActive: true,
              createdByUserId: "admin-1",
              createdAt: "2026-04-08T10:00:00.000Z",
              updatedAt: "2026-04-08T10:00:00.000Z",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (input === "/api/admin/shop/api-key-applications") {
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (input === "/api/admin/shop/orders?status=PENDING") {
      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "order-1",
              status: "PENDING",
              pricePaid: 300,
              currencyType: "POINTS",
              deliveryChannel: "AGENT_CHAT",
              failureReason: null,
              quota: { amount: 10000, unit: "tokens" },
              createdAt: "2026-04-07T10:00:00.000Z",
              confirmedAt: null,
              fulfilledAt: null,
              product: {
                id: "product-1",
                name: "Provider Quota Pack",
                isActive: true,
              },
              buyer: {
                agentId: "agent-2",
                name: "Buyer Agent",
                type: "CUSTOM",
                ownerUserId: "user-2",
              },
              providedApiKey: null,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (input === "/api/admin/shop/orders/order-1/fulfill") {
      return new Response(
        JSON.stringify({
          success: true,
          data: { id: "order-1", status: "FULFILLED" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unexpected fetch: ${input}`);
  };

  const { rootNode, cleanup } = await renderPanelWithDom({
    products,
    fetchMock,
    onRefresh: async () => {
      refreshCount += 1;
    },
  });

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (
        requests.some((request) => request.input === "/api/admin/shop/api-keys") &&
        requests.some((request) => request.input === "/api/admin/shop/api-key-applications") &&
        requests.some((request) => request.input === "/api/admin/shop/orders?status=PENDING")
      ) {
        break;
      }
      await act(async () => {
        await Promise.resolve();
      });
    }

    assert.match(getNodeText(rootNode), /Primary OpenAI key/);
    assert.match(getNodeText(rootNode), /Buyer Agent/);

    const buttons = findElements(rootNode, (node) => node.tagName === "BUTTON");
    const fulfillButton = buttons.find((button) =>
      getNodeText(button).includes("admin.products.orders.fulfill")
    );
    assert.ok(fulfillButton);

    await act(async () => {
      rootNode.dispatchEvent({
        type: "click",
        target: fulfillButton!,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.equal(
      requests.some(
        (request) =>
          request.input === "/api/admin/shop/orders/order-1/fulfill" &&
          request.init?.method === "POST" &&
          !request.init?.body
      ),
      true
    );
    assert.equal(refreshCount, 1);
  } finally {
    await cleanup();
  }
});

test("AdminSecretProductsPanel shows bound account API keys as read-only list", async () => {
  const products = [createProduct()];
  const requests: Array<{ input: string; init?: RequestInit }> = [];

  const fetchMock = async (input: string, init?: RequestInit) => {
    requests.push({ input, init });

    if (input === "/api/admin/shop/api-keys") {
      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "key-1",
              label: "Primary OpenAI key",
              providerLabel: "OpenAI",
              maskedKey: "sk-****1234",
              isActive: true,
              createdByUserId: "admin-1",
              createdAt: "2026-04-08T10:00:00.000Z",
              updatedAt: "2026-04-08T10:00:00.000Z",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (input === "/api/admin/shop/api-key-applications") {
      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "application-1",
              status: "FULFILLED",
              requestedAt: "2026-04-07T10:00:00.000Z",
              fulfilledAt: "2026-04-07T10:05:00.000Z",
              user: {
                id: "user-1",
                email: "agent@example.com",
                name: "Agent Owner",
              },
              providedApiKey: {
                id: "key-1",
                maskedKey: "sk-****1234",
                isActive: true,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (input === "/api/admin/shop/orders?status=PENDING") {
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unexpected fetch: ${input}`);
  };

  const { rootNode, cleanup } = await renderPanelWithDom({
    products,
    fetchMock,
    onRefresh: async () => undefined,
  });

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (
        requests.some((request) => request.input === "/api/admin/shop/api-keys") &&
        requests.some((request) => request.input === "/api/admin/shop/api-key-applications")
      ) {
        break;
      }
      await act(async () => {
        await Promise.resolve();
      });
    }

    assert.match(getNodeText(rootNode), /Agent Owner/);
    assert.match(getNodeText(rootNode), /agent@example\.com/);
    assert.match(getNodeText(rootNode), /sk-\*{4}1234/);
    assert.match(getNodeText(rootNode), /admin\.products\.bindings\.status\.active/);
    assert.equal(
      requests.some(
        (request) => request.input === "/api/admin/shop/api-key-applications/application-1/fulfill"
      ),
      false
    );
  } finally {
    await cleanup();
  }
});

test("performAdminSecretProductMutation stays pending until refresh finishes", async () => {
  const events: string[] = [];
  let resolveRefresh: (() => void) | null = null;

  const mutationPromise = performAdminSecretProductMutation({
    request: async () => ({
      success: true,
    }),
    onRefresh: () =>
      new Promise<void>((resolve) => {
        events.push("refresh:start");
        resolveRefresh = () => {
          events.push("refresh:done");
          resolve();
        };
      }),
    onError: (message) => {
      events.push(`error:${message ?? "null"}`);
    },
    onSuccess: (message) => {
      events.push(`success:${message ?? "null"}`);
    },
    successMessage: "products-ok",
    errorFallback: "products-failed",
  });

  let settled = false;
  void mutationPromise.then(() => {
    settled = true;
  });

  await Promise.resolve();

  assert.deepEqual(events, ["success:products-ok", "refresh:start"]);
  assert.equal(settled, false);

  resolveRefresh?.();
  await mutationPromise;

  assert.equal(settled, true);
  assert.deepEqual(events, ["success:products-ok", "refresh:start", "refresh:done"]);
});

test("normalizeInventoryProductId still normalizes product selection", () => {
  const products = [createProduct(), createProduct({ id: "product-2", isActive: false })];

  assert.equal(normalizeInventoryProductId(products, ""), "product-1");
  assert.equal(normalizeInventoryProductId(products, "product-2"), "product-2");
  assert.equal(normalizeInventoryProductId(products, "missing"), "product-1");
  assert.equal(normalizeInventoryProductId([], "product-1"), "");
});
