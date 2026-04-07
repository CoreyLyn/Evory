import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminSecretProduct } from "@/lib/shop-client";

import {
  AdminSecretProductsPanel,
  buildAdminSecretProductUpdateInput,
  buildAdminSecretProductUpdateInputFromDraft,
  createInitialProductDraft,
  createProductDraftFromProduct,
  getEffectiveAllowRepeatPurchase,
  normalizeInventoryProductId,
  performAdminSecretProductMutation,
  resolvePerAgentPurchaseLimit,
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
      if (this.tagName === "SELECT" && child.nodeType === 1 && this.options) {
        this.options = this.options.filter((item) => item !== child);
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
  const previousActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;

  const { rootNode } = installMinimalDom();
  globalThis.fetch = props.fetchMock as typeof fetch;

  const root = ReactDOMClient.createRoot(rootNode as never);

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

test("AdminSecretProductsPanel renders provider fields and inventory import textarea", () => {
  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={(key) => key}
      products={[
        {
          id: "product-1",
          name: "Provider Pack",
          description: "Secret credential",
          productType: "SECRET_CREDENTIAL",
          price: 300,
          currencyType: "POINTS",
          isActive: true,
          displayConfig: {
            providerLabel: "Provider",
            usageInstructions: "Store securely",
          },
          fulfillmentConfig: {
            allowRepeatPurchase: true,
          },
          availableInventoryCount: 2,
          orderCount: 1,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      ]}
      loading={false}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /admin\.products\.form\.providerLabel/);
  assert.match(html, /admin\.products\.form\.usageInstructions/);
  assert.match(html, /admin\.products\.inventory\.secrets/);
  assert.match(html, /textarea/);
});

test("AdminSecretProductsPanel renders product counts and inactive state details", () => {
  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={(key) => key}
      products={[
        {
          id: "product-1",
          name: "Provider Pack",
          description: "Secret credential",
          productType: "SECRET_CREDENTIAL",
          price: 300,
          currencyType: "POINTS",
          isActive: true,
          displayConfig: {
            providerLabel: "Provider",
          },
          fulfillmentConfig: {
            allowRepeatPurchase: true,
          },
          availableInventoryCount: 2,
          orderCount: 1,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
        {
          id: "product-2",
          name: "Backup Pack",
          description: "",
          productType: "SECRET_CREDENTIAL",
          price: 500,
          currencyType: "POINTS",
          isActive: false,
          displayConfig: {
            providerLabel: "Backup",
          },
          fulfillmentConfig: {
            allowRepeatPurchase: false,
          },
          availableInventoryCount: 0,
          orderCount: 3,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      ]}
      loading={false}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /Provider Pack/);
  assert.match(html, /Backup Pack/);
  assert.match(html, /admin\.products\.status\.inactive/);
  assert.match(html, /admin\.products\.inventory\.count/);
  assert.match(html, /admin\.products\.orders\.count/);
  assert.match(html, /Provider/);
  assert.match(html, /Backup/);
  assert.match(html, />2</);
  assert.match(html, />3</);
});

test("AdminSecretProductsPanel renders status-specific stock breakdown", () => {
  const products = [
    {
      id: "product-1",
      name: "Provider Pack",
      description: "Secret credential",
      productType: "SECRET_CREDENTIAL",
      price: 300,
      currencyType: "POINTS",
      isActive: true,
      displayConfig: {
        providerLabel: "Provider",
      },
      fulfillmentConfig: {
        allowRepeatPurchase: true,
      },
      availableInventoryCount: 4,
      soldInventoryCount: 2,
      voidInventoryCount: 1,
      orderCount: 3,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    },
  ] as unknown as AdminSecretProduct[];

  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={(key) => key}
      products={products}
      loading={false}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /admin\.products\.inventory\.count/);
  assert.match(html, /admin\.products\.inventory\.breakdown\.sold/);
  assert.match(html, /admin\.products\.inventory\.breakdown\.void/);
  assert.match(html, />4</);
  assert.match(html, />2</);
  assert.match(html, />1</);
});

test("AdminSecretProductsPanel renders order history controls", () => {
  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={(key) => key}
      products={[
        {
          id: "product-1",
          name: "Provider Pack",
          description: "Secret credential",
          productType: "SECRET_CREDENTIAL",
          price: 300,
          currencyType: "POINTS",
          isActive: true,
          displayConfig: {
            providerLabel: "Provider",
          },
          fulfillmentConfig: {
            allowRepeatPurchase: true,
          },
          availableInventoryCount: 2,
          orderCount: 1,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      ]}
      loading={false}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /admin\.products\.orders\.title/);
  assert.match(html, /admin\.products\.orders\.filters\.status/);
  assert.match(html, /admin\.products\.orders\.filters\.buyerAgentId/);
});

test("AdminSecretProductsPanel fetches order history for the selected product", async () => {
  const products: AdminSecretProduct[] = [
    {
      id: "product-1",
      name: "Provider Pack",
      description: "Secret credential",
      productType: "SECRET_CREDENTIAL",
      price: 300,
      currencyType: "POINTS",
      isActive: true,
      displayConfig: {
        providerLabel: "Provider",
      },
      fulfillmentConfig: {
        allowRepeatPurchase: true,
      },
      availableInventoryCount: 1,
      orderCount: 1,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    },
  ];

  const requests: Array<{ input: string; init?: RequestInit }> = [];

  const fetchMock = async (input: string, init?: RequestInit) => {
    requests.push({ input, init });

    if (input.endsWith("/inventory") && (!init || !init.method || init.method === "GET")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            productId: "product-1",
            inventory: [],
          },
        }),
      } as Response;
    }

    if (input.startsWith("/api/admin/shop/orders?productId=product-1")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              id: "order-1",
              status: "FULFILLED",
              pricePaid: 300,
              currencyType: "POINTS",
              deliveryChannel: "AGENT_CHAT",
              failureReason: null,
              createdAt: "2026-04-07T10:00:00.000Z",
              fulfilledAt: "2026-04-07T10:01:00.000Z",
              product: {
                id: "product-1",
                name: "Provider Pack",
                isActive: true,
              },
              buyer: {
                agentId: "agent-2",
                name: "Buyer Agent",
                type: "CUSTOM",
                ownerUserId: "user-2",
              },
              delivery: {
                deliveredAt: "2026-04-07T10:01:30.000Z",
                secretInventoryId: "inventory-1",
                maskedSecret: "sk-****1234",
              },
            },
          ],
        }),
      } as Response;
    }

    throw new Error(`Unexpected fetch: ${input}`);
  };

  const { rootNode, cleanup } = await renderPanelWithDom({
    products,
    fetchMock,
    onRefresh: () => Promise.resolve(),
  });

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (
        requests.some((request) =>
          request.input.startsWith("/api/admin/shop/orders?productId=product-1")
        )
      ) {
        break;
      }
      await act(async () => {
        await Promise.resolve();
      });
    }

    assert.equal(
      requests.some((request) =>
        request.input.startsWith("/api/admin/shop/orders?productId=product-1")
      ),
      true
    );
    assert.match(getNodeText(rootNode), /Buyer Agent/);
    assert.match(getNodeText(rootNode), /sk-\*\*\*\*1234/);
  } finally {
    await cleanup();
  }
});

test("AdminSecretProductsPanel void flow triggers API request for available inventory", async () => {
  const products: AdminSecretProduct[] = [
    {
      id: "product-1",
      name: "Provider Pack",
      description: "Secret credential",
      productType: "SECRET_CREDENTIAL",
      price: 300,
      currencyType: "POINTS",
      isActive: true,
      displayConfig: {
        providerLabel: "Provider",
      },
      fulfillmentConfig: {
        allowRepeatPurchase: true,
      },
      availableInventoryCount: 1,
      orderCount: 0,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    },
  ];

  const requests: Array<{ input: string; init?: RequestInit }> = [];
  let refreshCount = 0;

  const fetchMock = async (input: string, init?: RequestInit) => {
    requests.push({ input, init });

    if (input.endsWith("/inventory") && (!init || !init.method || init.method === "GET")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            productId: "product-1",
            inventory: [
              {
                id: "inventory-1",
                maskedValue: "sk-****1234",
                status: "AVAILABLE",
                createdAt: "2026-04-02T00:00:00.000Z",
                soldAt: null,
                importBatch: {
                  id: "batch-1",
                  sourceLabel: "batch A",
                  note: "first batch",
                  importedByUserId: "admin-1",
                  createdAt: "2026-04-01T00:00:00.000Z",
                },
              },
              {
                id: "inventory-2",
                maskedValue: "sk-****9999",
                status: "SOLD",
                createdAt: "2026-04-02T00:00:00.000Z",
                soldAt: "2026-04-02T01:00:00.000Z",
                importBatch: null,
              },
            ],
          },
        }),
      } as Response;
    }

    if (input.includes("/inventory/inventory-1/void")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
        }),
      } as Response;
    }

    throw new Error(`Unexpected fetch: ${input}`);
  };

  const onRefresh = async () => {
    refreshCount += 1;
  };

  const { rootNode, cleanup } = await renderPanelWithDom({
    products,
    fetchMock,
    onRefresh,
  });

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (requests.some((request) => request.input.endsWith("/inventory"))) {
        break;
      }
      await act(async () => {
        await Promise.resolve();
      });
    }
    await act(async () => {
      await Promise.resolve();
    });

    const buttons = findElements(
      rootNode,
      (node) => node.tagName === "BUTTON"
    );
    const voidButtons = buttons.filter((button) =>
      getNodeText(button).includes("admin.products.inventory.details.void")
    );

    assert.equal(voidButtons.length, 1);

    const voidButton = voidButtons[0];
    assert.ok(voidButton);

    await act(async () => {
      const clickEvent: MinimalEvent = { type: "click", target: voidButton };
      rootNode.dispatchEvent(clickEvent);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.equal(
      requests.some(
        (request) =>
          request.input.includes("/api/admin/shop/inventory/inventory-1/void") &&
          request.init?.method === "POST"
      ),
      true
    );
    assert.equal(
      requests.filter((request) => request.input.endsWith("/inventory")).length >= 2,
      true
    );
    assert.equal(refreshCount, 1);
  } finally {
    await cleanup();
  }
});

test("AdminSecretProductsPanel renders edit and activation actions per product", () => {
  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={(key) => key}
      products={[
        {
          id: "product-1",
          name: "Provider Pack",
          description: "Secret credential",
          productType: "SECRET_CREDENTIAL",
          price: 300,
          currencyType: "POINTS",
          isActive: true,
          displayConfig: {
            providerLabel: "Provider",
          },
          fulfillmentConfig: {
            allowRepeatPurchase: true,
          },
          availableInventoryCount: 2,
          orderCount: 1,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
        {
          id: "product-2",
          name: "Backup Pack",
          description: "",
          productType: "SECRET_CREDENTIAL",
          price: 500,
          currencyType: "POINTS",
          isActive: false,
          displayConfig: {
            providerLabel: "Backup",
          },
          fulfillmentConfig: {
            allowRepeatPurchase: false,
          },
          availableInventoryCount: 1,
          orderCount: 0,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      ]}
      loading={false}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /admin\.products\.action\.edit/);
  assert.match(html, /admin\.products\.action\.deactivate/);
  assert.match(html, /admin\.products\.action\.activate/);
});

test("createInitialProductDraft defaults to unlimited per-agent limit", () => {
  const draft = createInitialProductDraft();

  assert.equal(draft.perAgentPurchaseLimit, null);
  assert.equal(draft.perAgentPurchaseLimitMode, "unlimited");
});

test("createProductDraftFromProduct maps per-agent limit for edit mode", () => {
  const draftWithLimit = createProductDraftFromProduct({
    id: "product-1",
    name: "Provider Pack",
    description: "Secret credential",
    productType: "SECRET_CREDENTIAL",
    price: 300,
    currencyType: "POINTS",
    isActive: true,
    displayConfig: {
      providerLabel: "Provider",
    },
    fulfillmentConfig: {
      allowRepeatPurchase: true,
      perAgentPurchaseLimit: 2,
    },
    availableInventoryCount: 2,
    orderCount: 1,
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-02T00:00:00.000Z",
  });

  assert.equal(draftWithLimit.perAgentPurchaseLimitMode, "limited");
  assert.equal(draftWithLimit.perAgentPurchaseLimit, 2);

  const draftUnlimited = createProductDraftFromProduct({
    id: "product-2",
    name: "Backup Pack",
    description: "Secret credential",
    productType: "SECRET_CREDENTIAL",
    price: 500,
    currencyType: "POINTS",
    isActive: true,
    displayConfig: {
      providerLabel: "Backup",
    },
    fulfillmentConfig: {
      allowRepeatPurchase: false,
      perAgentPurchaseLimit: null,
    },
    availableInventoryCount: 1,
    orderCount: 0,
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-02T00:00:00.000Z",
  });

  assert.equal(draftUnlimited.perAgentPurchaseLimitMode, "unlimited");
  assert.equal(draftUnlimited.perAgentPurchaseLimit, null);
});

test("resolvePerAgentPurchaseLimit validates limited values", () => {
  assert.deepEqual(resolvePerAgentPurchaseLimit("unlimited", null), {
    value: null,
    error: null,
  });
  assert.deepEqual(resolvePerAgentPurchaseLimit("limited", null), {
    value: null,
    error: "admin.products.form.perAgentPurchaseLimitInvalid",
  });
  assert.deepEqual(resolvePerAgentPurchaseLimit("limited", 2), {
    value: 2,
    error: null,
  });
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

test("performAdminSecretProductMutation reports API errors without refreshing", async () => {
  const events: string[] = [];

  const didSucceed = await performAdminSecretProductMutation({
    request: async () => ({
      success: false,
      error: "import failed",
    }),
    onRefresh: async () => {
      events.push("refresh");
    },
    onError: (message) => {
      events.push(`error:${message ?? "null"}`);
    },
    onSuccess: (message) => {
      events.push(`success:${message ?? "null"}`);
    },
    successMessage: "products-ok",
    errorFallback: "products-failed",
  });

  assert.equal(didSucceed, false);
  assert.deepEqual(events, ["error:import failed"]);
});

test("normalizeInventoryProductId auto-selects and normalizes invalid selection", () => {
  const products = [
    {
      id: "product-1",
      name: "Provider Pack",
      description: "Secret credential",
      productType: "SECRET_CREDENTIAL" as const,
      price: 300,
      currencyType: "POINTS" as const,
      isActive: true,
      displayConfig: { providerLabel: "Provider" },
      fulfillmentConfig: { allowRepeatPurchase: true },
      availableInventoryCount: 2,
      orderCount: 1,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    },
    {
      id: "product-2",
      name: "Backup Pack",
      description: "Second secret credential",
      productType: "SECRET_CREDENTIAL" as const,
      price: 500,
      currencyType: "POINTS" as const,
      isActive: false,
      displayConfig: { providerLabel: "Backup" },
      fulfillmentConfig: { allowRepeatPurchase: false },
      availableInventoryCount: 0,
      orderCount: 0,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    },
  ];

  assert.equal(normalizeInventoryProductId(products, ""), "product-1");
  assert.equal(normalizeInventoryProductId(products, "product-2"), "product-2");
  assert.equal(normalizeInventoryProductId(products, "missing"), "product-1");
  assert.equal(normalizeInventoryProductId([], "product-1"), "");
});

test("getEffectiveAllowRepeatPurchase defaults to true when missing", () => {
  assert.equal(
    getEffectiveAllowRepeatPurchase({
      id: "product-1",
      name: "Provider Pack",
      description: "Secret credential",
      productType: "SECRET_CREDENTIAL",
      price: 300,
      currencyType: "POINTS",
      isActive: true,
      displayConfig: { providerLabel: "Provider" },
      fulfillmentConfig: {},
      availableInventoryCount: 2,
      orderCount: 1,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    }),
    true
  );
  assert.equal(
    getEffectiveAllowRepeatPurchase({
      id: "product-2",
      name: "Provider Pack",
      description: "Secret credential",
      productType: "SECRET_CREDENTIAL",
      price: 300,
      currencyType: "POINTS",
      isActive: true,
      displayConfig: { providerLabel: "Provider" },
      fulfillmentConfig: { allowRepeatPurchase: false },
      availableInventoryCount: 2,
      orderCount: 1,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    }),
    false
  );
});

test("buildAdminSecretProductUpdateInput keeps latest product values with activation toggle", () => {
  const product = {
    id: "product-1",
    name: "Provider Pack",
    description: "Secret credential",
    productType: "SECRET_CREDENTIAL" as const,
    price: 300,
    currencyType: "POINTS" as const,
    isActive: true,
    displayConfig: {
      providerLabel: "Provider",
      usageInstructions: "Store securely",
    },
    fulfillmentConfig: {},
    availableInventoryCount: 2,
    orderCount: 1,
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-02T00:00:00.000Z",
  };

  const input = buildAdminSecretProductUpdateInput({
    product,
    allowRepeatPurchase: getEffectiveAllowRepeatPurchase(product),
    perAgentPurchaseLimit: null,
    isActive: false,
  });

  assert.equal(input.isActive, false);
  assert.equal(input.name, "Provider Pack");
  assert.equal(input.providerLabel, "Provider");
  assert.equal(input.usageInstructions, "Store securely");
  assert.equal(input.allowRepeatPurchase, true);
});

test("buildAdminSecretProductUpdateInputFromDraft uses draft fields for updates", () => {
  const draft = {
    name: "Updated Pack",
    description: "New description",
    price: 500,
    providerLabel: "Provider",
    usageInstructions: "Use carefully",
    allowRepeatPurchase: false,
    perAgentPurchaseLimitMode: "limited" as const,
    perAgentPurchaseLimit: 2,
  };

  const input = buildAdminSecretProductUpdateInputFromDraft({
    draft,
    perAgentPurchaseLimit: 2,
    isActive: true,
  });

  assert.equal(input.name, "Updated Pack");
  assert.equal(input.description, "New description");
  assert.equal(input.price, 500);
  assert.equal(input.providerLabel, "Provider");
  assert.equal(input.usageInstructions, "Use carefully");
  assert.equal(input.allowRepeatPurchase, false);
  assert.equal(input.perAgentPurchaseLimit, 2);
  assert.equal(input.isActive, true);
});
