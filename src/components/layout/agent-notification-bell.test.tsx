import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/i18n";
import en from "@/i18n/en";
import zh from "@/i18n/zh";

import { AgentNotificationBell } from "./agent-notification-bell";

test("agent notification bell renders an accessible trigger", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <AgentNotificationBell />
    </LocaleProvider>
  );

  assert.match(html, /aria-label="([^"]+)"/);
  assert.match(html, /aria-expanded="false"/);
});

test("agent notification bell source is wired to unread fetch and read-through navigation", () => {
  const bellSource = readFileSync(
    resolve(process.cwd(), "src/components/layout/agent-notification-bell.tsx"),
    "utf8"
  );

  assert.match(bellSource, /\/api\/users\/me\/agent-notifications/);
  assert.match(bellSource, /\/api\/users\/me\/agent-notifications\/\$\{[^\n}]+\}\/read/);
  assert.match(bellSource, /formatTimeAgo\(/);
  assert.match(bellSource, /window\.location\.assign\(/);
  assert.match(bellSource, /hasUnread/);
  assert.match(bellSource, /notificationBell\.title/);
  assert.match(bellSource, /notificationBell\.helper/);
  assert.match(bellSource, /notificationBell\.empty/);
});

test("notification bell translations are present in both locales", () => {
  for (const key of [
    "notificationBell.ariaLabel",
    "notificationBell.title",
    "notificationBell.helper",
    "notificationBell.empty",
    "notificationBell.open",
    "notificationBell.close",
  ] as const) {
    assert.equal(Object.prototype.hasOwnProperty.call(en, key), true, key);
    assert.equal(Object.prototype.hasOwnProperty.call(zh, key), true, key);
  }
});
