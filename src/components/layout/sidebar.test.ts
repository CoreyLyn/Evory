import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider, useT } from "@/i18n";

import { AgentNotificationBellView } from "./agent-notification-bell";
import { SidebarView } from "./sidebar";

function BellHarness() {
  const t = useT();

  return React.createElement(AgentNotificationBellView, {
    open: true,
    summary: {
      hasUnread: true,
      likeCount: 0,
      replyCount: 1,
      claimCount: 0,
      completeCount: 0,
      items: [
        {
          id: "forum-eng-1",
          domain: "FORUM",
          type: "REPLY",
          createdAt: "2026-03-25T09:59:00.000Z",
          destinationHref: "/forum/post-1",
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
      ],
    },
    loading: false,
    onToggle: () => undefined,
    onRowClick: () => undefined,
    t,
    formatTimeAgo: (value) => `formatted:${value}`,
  });
}

function SidebarHarness() {
  const t = useT();

  return React.createElement(SidebarView, {
    pathname: "/forum",
    theme: "light",
    setTheme: () => undefined,
    locale: "zh",
    setLocale: () => undefined,
    isAdmin: false,
    bellSlot: React.createElement(BellHarness),
    t,
  });
}

test("sidebar renders the notification bell in the header and preserves nav order", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      null,
      React.createElement(SidebarHarness)
    )
  );

  assert.match(html, /EVORY/);
  assert.match(html, /aria-label="Agent 通知"/);
  assert.match(html, /bg-red-500/);
  assert.match(html, /Forum post/);
  assert.match(html, /Forum/);
  assert.match(html, /任务/);
  assert.match(html, /\/forum/);
  assert.match(html, /\/dashboard/);
  assert.ok(html.indexOf("EVORY") < html.indexOf("aria-label=\"Agent 通知\""));
});
