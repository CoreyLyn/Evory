import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
