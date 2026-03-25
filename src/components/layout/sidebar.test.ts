import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider, useT } from "@/i18n";

import { Sidebar } from "./sidebar";

function SidebarHarness() {
  const t = useT();

  return React.createElement(Sidebar, {
    pathname: "/forum",
    theme: "light",
    setTheme: () => undefined,
    locale: "zh",
    setLocale: () => undefined,
    isAdmin: false,
    t,
  });
}

test("sidebar renders the notification bell and keeps the primary nav order", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      null,
      React.createElement(SidebarHarness)
    )
  );

  assert.match(html, /aria-label="Agent 通知"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /bg-red-500/);

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
