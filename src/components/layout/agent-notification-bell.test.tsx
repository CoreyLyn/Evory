import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider, useT } from "@/i18n";
import type {
  AgentNotificationItem,
  AgentNotificationSummary,
} from "@/lib/agent-notifications";

import {
  agentNotificationBellRuntime,
  AgentNotificationBellView,
  AgentNotificationBell,
  createAgentNotificationRowClickHandler,
  reconcileAgentNotificationSummaryAfterRead,
} from "./agent-notification-bell";

const mixedSummary: AgentNotificationSummary = {
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
};

const emptySummary: AgentNotificationSummary = {
  hasUnread: false,
  likeCount: 0,
  replyCount: 0,
  claimCount: 0,
  completeCount: 0,
  items: [],
};

function BellHarness({
  summary,
  open,
  loading,
  onRowClick,
}: {
  summary: AgentNotificationSummary;
  open: boolean;
  loading: boolean;
  onRowClick: (item: AgentNotificationItem) => void;
}) {
  const t = useT();

  return (
    <AgentNotificationBellView
      open={open}
      summary={summary}
      loading={loading}
      onToggle={() => undefined}
      onRowClick={onRowClick}
      t={t}
      formatTimeAgo={(value) => `formatted:${value}`}
    />
  );
}

function renderBell(
  summary: AgentNotificationSummary,
  open: boolean,
  loading = false,
  onRowClick: (item: AgentNotificationItem) => void = () => undefined
) {
  return renderToStaticMarkup(
    <LocaleProvider>
      <BellHarness
        summary={summary}
        open={open}
        loading={loading}
        onRowClick={onRowClick}
      />
    </LocaleProvider>
  );
}

test("agent notification bell shows an unread dot without opening the popover", () => {
  const closedHtml = renderBell(mixedSummary, false);
  const openHtml = renderBell(mixedSummary, true);

  assert.match(closedHtml, /aria-expanded="false"/);
  assert.match(closedHtml, /bg-red-500/);
  assert.doesNotMatch(closedHtml, /notificationBell\.helper/);

  assert.match(openHtml, /aria-expanded="true"/);
  assert.match(openHtml, /bg-red-500/);
  assert.match(openHtml, /新互动/);
  assert.match(openHtml, /1 条回复，1 个认领/);
  assert.doesNotMatch(openHtml, /点击后跳转并标记为已读/);
  assert.match(openHtml, /bg-sidebar\/98/);
  assert.match(openHtml, /left-full top-0 z-50 ml-3 w-\[20rem\] max-w-\[calc\(100vw-5rem\)\]/);
});

test("agent notification bell renders through the connected path and consults the router hook", () => {
  let routerUseCount = 0;
  const pushCalls: string[] = [];
  const originalUseRouter = agentNotificationBellRuntime.useRouter;

  agentNotificationBellRuntime.useRouter = () => {
    routerUseCount += 1;
    return {
      push: (href: string) => {
        pushCalls.push(href);
      },
    };
  };

  let html = "";
  try {
    html = renderToStaticMarkup(
      <LocaleProvider>
        <AgentNotificationBell />
      </LocaleProvider>
    );
  } finally {
    agentNotificationBellRuntime.useRouter = originalUseRouter;
  }

  assert.match(html, /aria-label="Agent 通知"/);
  assert.match(html, /aria-expanded="false"/);
  assert.equal(routerUseCount, 1);
  assert.deepEqual(pushCalls, []);
});

test("agent notification bell renders mixed rows and an empty state", () => {
  const openHtml = renderBell(mixedSummary, true);
  const emptyHtml = renderBell(emptySummary, true);

  assert.match(openHtml, /Forum Actor/);
  assert.match(openHtml, /Task Actor/);
  assert.match(openHtml, /Forum post/);
  assert.match(openHtml, /Task title/);
  assert.match(openHtml, /Useful reply/);
  assert.match(openHtml, /formatted:2026-03-25T09:59:00.000Z/);
  assert.match(openHtml, /formatted:2026-03-25T09:58:00.000Z/);
  assert.match(openHtml, /论坛/);
  assert.match(openHtml, /任务/);

  assert.match(emptyHtml, /当前没有未读通知。/);
  assert.doesNotMatch(emptyHtml, /Forum Actor/);
  assert.doesNotMatch(emptyHtml, /Task Actor/);
});

test("agent notification bell reconciles local unread state after a row click", () => {
  const nextSummary = reconcileAgentNotificationSummaryAfterRead(
    mixedSummary,
    mixedSummary.items[0]!
  );

  assert.equal(nextSummary.hasUnread, true);
  assert.equal(nextSummary.replyCount, 0);
  assert.equal(nextSummary.claimCount, 1);
  assert.deepEqual(nextSummary.items.map((item) => item.id), ["task-eng-1"]);
});

test("agent notification bell row actions read best-effort without delaying navigation", () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const navigations: string[] = [];
  const router = {
    push: (href: string) => {
      navigations.push(href);
    },
  };

  const handler = createAgentNotificationRowClickHandler({
    fetchImpl: ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.reject(new Error("network failed"));
    }) as typeof fetch,
    navigate: router.push,
  });

  handler(mixedSummary.items[0]!);

  assert.deepEqual(calls, [
    {
      url: "/api/users/me/agent-notifications/forum-eng-1/read",
      init: {
        method: "POST",
        credentials: "same-origin",
      },
    },
  ]);
  assert.deepEqual(navigations, ["/forum/post-1"]);
});
