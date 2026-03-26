import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";

import { LocaleProvider } from "@/i18n";
import { agentNotificationBellRuntime } from "./agent-notification-bell";
import { sidebarRuntime, Sidebar } from "./sidebar";

test("sidebar renders the live notification bell and preserves the primary nav order", () => {
  const originalSidebarRuntime = {
    usePathname: sidebarRuntime.usePathname,
    useTheme: sidebarRuntime.useTheme,
    useLocale: sidebarRuntime.useLocale,
    useCurrentUser: sidebarRuntime.useCurrentUser,
  };
  const originalBellUseRouter = agentNotificationBellRuntime.useRouter;
  const pushCalls: string[] = [];

  sidebarRuntime.usePathname = () => "/forum";
  sidebarRuntime.useTheme = () => ({ theme: "light", setTheme: () => undefined });
  sidebarRuntime.useLocale = () => ({
    locale: "zh",
    setLocale: () => undefined,
  });
  sidebarRuntime.useCurrentUser = () => ({
    user: null,
    isAdmin: false,
    loading: false,
  });
  agentNotificationBellRuntime.useRouter = () => ({
    push: (href: string) => {
      pushCalls.push(href);
    },
  });

  let html = "";
  try {
    html = renderToStaticMarkup(
      React.createElement(LocaleProvider, null, React.createElement(Sidebar))
    );
  } finally {
    sidebarRuntime.usePathname = originalSidebarRuntime.usePathname;
    sidebarRuntime.useTheme = originalSidebarRuntime.useTheme;
    sidebarRuntime.useLocale = originalSidebarRuntime.useLocale;
    sidebarRuntime.useCurrentUser = originalSidebarRuntime.useCurrentUser;
    agentNotificationBellRuntime.useRouter = originalBellUseRouter;
  }

  assert.match(html, /EVORY/);
  assert.match(html, /aria-label="Agent 通知"/);
  assert.match(html, /aria-expanded="false"/);
  assert.deepEqual(pushCalls, []);

  const navHrefMatches = Array.from(html.matchAll(/href="([^"]+)"/g)).map(
    (match) => match[1]
  );

  assert.deepEqual(navHrefMatches.slice(0, 7), [
    "/forum",
    "/tasks",
    "/knowledge",
    "/office",
    "/shop",
    "/agents",
    "/dashboard",
  ]);

  assert.ok(html.indexOf("EVORY") < html.indexOf("aria-label=\"Agent 通知\""));
});

async function getFreePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to reserve a test port");
  }

  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  return port;
}

async function waitForReady(baseUrl: string) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting for Next dev to finish compiling.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${baseUrl} to become ready`);
}

async function waitForCondition(
  condition: () => Promise<boolean>,
  timeoutMs = 30_000
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for condition");
}

async function startDevServer(port: number) {
  const child = spawn("npm", [
    "run",
    "dev",
    "--",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stderr: string[] = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr.push(String(chunk));
  });

  const exitPromise = once(child, "exit").then(([code, signal]) => ({
    code,
    signal,
  }));

  return {
    child,
    stderr,
    exitPromise,
  };
}

test("sidebar mounts the live bell and uses router.push on row clicks", async () => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { child, stderr, exitPromise } = await startDevServer(port);

  let browser;

  try {
    await waitForReady(baseUrl);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addInitScript(() => {
      const key = "__task3_notification_bell_reload_count__";
      const nextCount =
        Number(window.localStorage.getItem(key) ?? "0") + 1;
      window.localStorage.setItem(key, String(nextCount));

      (window as typeof window & { __task3PushStateCalls?: string[] }).__task3PushStateCalls = [];

      const originalPushState = history.pushState.bind(history);
      history.pushState = ((...args: Parameters<History["pushState"]>) => {
        const state = window as typeof window & {
          __task3PushStateCalls?: string[];
        };
        state.__task3PushStateCalls?.push(String(args[2] ?? ""));
        return originalPushState(...args);
      }) as History["pushState"];
    });

    const page = await context.newPage();
    const authRequests: string[] = [];
    const readRequests: Array<{ url: string; method: string }> = [];

    await page.route("**/api/auth/me", async (route) => {
      authRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            role: "USER",
          },
        }),
      });
    });

    await page.route("**/api/users/me/agent-notifications", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            hasUnread: true,
            likeCount: 0,
            replyCount: 1,
            claimCount: 1,
            completeCount: 0,
            items: [
              {
                id: "forum-eng-1",
                domain: "FORUM",
                type: "REPLY",
                createdAt: "2026-03-25T09:59:00.000Z",
                destinationHref: "/signup?from=bell",
                actorAgent: {
                  id: "actor-1",
                  name: "Forum Actor",
                  type: "CODEX",
                },
                ownerAgent: {
                  id: "owner-1",
                  name: "Author Agent",
                },
                post: {
                  id: "post-1",
                  title: "Forum post",
                },
                reply: {
                  id: "reply-1",
                  content: "Useful reply",
                },
              },
              {
                id: "task-eng-1",
                domain: "TASK",
                type: "CLAIMED",
                createdAt: "2026-03-25T09:58:00.000Z",
                destinationHref: "/tasks/task-1",
                actorAgent: {
                  id: "actor-2",
                  name: "Task Actor",
                  type: "CUSTOM",
                },
                ownerAgent: {
                  id: "owner-2",
                  name: "Creator Agent",
                },
                task: {
                  id: "task-1",
                  title: "Task title",
                },
              },
            ],
          },
        }),
      });
    });

    await page.route(
      "**/api/users/me/agent-notifications/*/read",
      async (route) => {
        readRequests.push({
          url: route.request().url(),
          method: route.request().method(),
        });
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
          }),
        });
      }
    );

    await page.goto("/login");

    const bellButton = page.getByRole("button", { name: "Agent 通知" });
    const unreadDot = bellButton.locator(".bg-red-500");

    await waitForCondition(async () => authRequests.length === 1);
    await unreadDot.waitFor({ state: "visible" });

    await bellButton.click();

    const dialog = page.getByRole("dialog", { name: "新互动" });
    await dialog.waitFor({ state: "visible" });
    await page.getByText("1 条回复，1 个认领").waitFor({ state: "visible" });
    await page.getByText("Forum Actor").waitFor({ state: "visible" });
    await page.getByText("Task Actor").waitFor({ state: "visible" });
    await page.getByText("Useful reply").waitFor({ state: "visible" });
    await unreadDot.waitFor({ state: "visible" });

    await dialog.locator("button").first().click();

    await waitForCondition(async () => readRequests.length === 1);
    assert.deepEqual(readRequests, [
      {
        url: `${baseUrl}/api/users/me/agent-notifications/forum-eng-1/read`,
        method: "POST",
      },
    ]);
    await page.waitForURL(/\/signup\?from=bell$/);
    await waitForCondition(
      async () =>
        (await page.evaluate(
          () =>
            window.localStorage.getItem("__task3_notification_bell_reload_count__")
        )) === "1"
    );
    await waitForCondition(
      async () =>
        JSON.stringify(
          await page.evaluate(
            () =>
              (window as typeof window & {
                __task3PushStateCalls?: string[];
              }).__task3PushStateCalls ?? []
          )
        ) === JSON.stringify(["/signup?from=bell"])
    );
  } finally {
    if (browser) {
      await browser.close();
    }

    child.kill("SIGTERM");
    await exitPromise.catch(() => undefined);

    if (stderr.length > 0) {
      // Keep the process logs available if the server fails during debugging.
      void stderr;
    }
  }
}, 120_000);
