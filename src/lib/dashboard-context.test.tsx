import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";
import { DashboardProvider, useDashboardState } from "./dashboard-context";

type Root = ReturnType<typeof ReactDOMClient.createRoot>;

type SpendingLeaderboardResult = {
  loading: string | null;
  spendingLeaderboard: string | null;
};

type SpendingLeaderboardEntry = {
  id: string;
  name: string;
  type: string;
  status: string;
  spentPoints: number;
  avatarConfig: null;
};

function DashboardStateProbe() {
  const state = useDashboardState();

  return React.createElement(
    React.Fragment,
    null,
    React.createElement("dashboard-loading", { value: state.loading ? "true" : "false" }),
    React.createElement("dashboard-spending-leaderboard", {
      value: JSON.stringify(state.spendingLeaderboard),
    })
  );
}

function setGlobalValue(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

type MinimalElementNode = {
  nodeType: number;
  tagName: string;
  ownerDocument: MinimalDocument;
  namespaceURI: string;
  style: Record<string, never>;
  attributes: Map<string, string>;
  children: Array<MinimalNode>;
  textContent: string;
  appendChild: (child: MinimalNode) => MinimalNode;
  removeChild: (child: MinimalNode) => MinimalNode;
  insertBefore: (child: MinimalNode) => MinimalNode;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  addEventListener: () => void;
  removeEventListener: () => void;
};

type MinimalTextNode = {
  nodeType: number;
  textContent: string;
  ownerDocument: MinimalDocument;
};

type MinimalNode = MinimalElementNode | MinimalTextNode;

type MinimalDocument = {
  nodeType: number;
  documentElement: { namespaceURI: string };
  defaultView: MinimalWindow | null;
  activeElement: null;
  addEventListener: () => void;
  removeEventListener: () => void;
  createElement: (tagName: string) => MinimalElementNode;
  createTextNode: (text: string) => MinimalTextNode;
};

type MinimalWindow = {
  document: MinimalDocument;
  navigator: { userAgent: string };
  HTMLElement: typeof globalThis.HTMLElement;
  HTMLIFrameElement: typeof globalThis.HTMLIFrameElement;
  Node: typeof globalThis.Node;
};

function installMinimalDom() {
  const trackedValues = {
    loading: "true",
    spendingLeaderboard: "",
  };

  const document = {
    nodeType: 9,
    documentElement: { namespaceURI: "http://www.w3.org/1999/xhtml" },
    defaultView: null as MinimalWindow | null,
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
    createElement(tagName: string) {
      return createElementNode(document, tagName, trackedValues);
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: text, ownerDocument: document };
    },
  } satisfies MinimalDocument;

  const rootNode = createElementNode(document, "div", trackedValues);

  const window = {
    document,
    navigator: { userAgent: "node" },
    HTMLElement: function HTMLElement() {},
    HTMLIFrameElement: function HTMLIFrameElement() {},
    Node: function Node() {},
  } satisfies MinimalWindow;

  document.defaultView = window;

  setGlobalValue("window", window);
  setGlobalValue("document", document);
  setGlobalValue("navigator", window.navigator);
  setGlobalValue("HTMLElement", window.HTMLElement);
  setGlobalValue("HTMLIFrameElement", window.HTMLIFrameElement);
  setGlobalValue("Node", window.Node);
  setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);

  return { rootNode, trackedValues };
}

function createElementNode(
  ownerDocument: MinimalDocument,
  tagName: string,
  trackedValues: { loading: string; spendingLeaderboard: string }
): MinimalElementNode {
  return {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    ownerDocument,
    namespaceURI: "http://www.w3.org/1999/xhtml",
    style: {},
    attributes: new Map<string, string>(),
    children: [],
    textContent: "",
    appendChild(child: MinimalNode) {
      this.children.push(child);
      return child;
    },
    removeChild(child: MinimalNode) {
      this.children = this.children.filter((item) => item !== child);
      return child;
    },
    insertBefore(child: MinimalNode) {
      this.children.push(child);
      return child;
    },
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
      if (tagName === "dashboard-loading" && name === "value") {
        trackedValues.loading = value;
      }
      if (tagName === "dashboard-spending-leaderboard" && name === "value") {
        trackedValues.spendingLeaderboard = value;
      }
    },
    removeAttribute(name: string) {
      this.attributes.delete(name);
    },
    addEventListener() {},
    removeEventListener() {},
  };
}

async function renderDashboardWithFetchResponse(data: Record<string, unknown>): Promise<SpendingLeaderboardResult> {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNavigator = globalThis.navigator;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousHTMLIFrameElement = globalThis.HTMLIFrameElement;
  const previousNode = globalThis.Node;
  const previousFetch = globalThis.fetch;
  const previousActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;

  const { rootNode, trackedValues } = installMinimalDom();

  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({ success: true, data }),
    }) as Response;

  let root: Root | null = null;

  try {
    root = ReactDOMClient.createRoot(rootNode as never);

    await act(async () => {
      root?.render(
        React.createElement(
          DashboardProvider,
          null,
          React.createElement(DashboardStateProbe)
        )
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    return {
      loading: trackedValues.loading,
      spendingLeaderboard: trackedValues.spendingLeaderboard,
    };
  } finally {
    await act(async () => {
      root?.unmount();
    });
    setGlobalValue("window", previousWindow);
    setGlobalValue("document", previousDocument);
    setGlobalValue("navigator", previousNavigator);
    setGlobalValue("HTMLElement", previousHTMLElement);
    setGlobalValue("HTMLIFrameElement", previousHTMLIFrameElement);
    setGlobalValue("Node", previousNode);
    setGlobalValue("IS_REACT_ACT_ENVIRONMENT", previousActEnvironment);
    globalThis.fetch = previousFetch;
  }
}

test("DashboardProvider stores spendingLeaderboard from API response", async () => {
  const spendingLeaderboard: SpendingLeaderboardEntry[] = [
    {
      id: "agent_1",
      name: "Agent One",
      type: "poster",
      status: "ONLINE",
      spentPoints: 120,
      avatarConfig: null,
    },
  ];

  const result = await renderDashboardWithFetchResponse({
    totalAgents: 10,
    onlineAgents: 3,
    totalPosts: 8,
    totalKnowledgeDocs: 5,
    totalTasks: 4,
    openTasks: 2,
    leaderboard: [],
    recentPosts: [],
    spendingLeaderboard,
  });

  assert.equal(result.loading, "false");
  assert.equal(result.spendingLeaderboard, JSON.stringify(spendingLeaderboard));
});

test("DashboardProvider falls back to empty spendingLeaderboard when API omits it", async () => {
  const result = await renderDashboardWithFetchResponse({
    totalAgents: 10,
    onlineAgents: 3,
    totalPosts: 8,
    totalKnowledgeDocs: 5,
    totalTasks: 4,
    openTasks: 2,
    leaderboard: [],
    recentPosts: [],
  });

  assert.equal(result.loading, "false");
  assert.equal(result.spendingLeaderboard, JSON.stringify([]));
});
