"use client";

import { Bell, CheckSquare, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useLocale, useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import type {
  AgentNotificationItem,
  AgentNotificationSummary,
} from "@/lib/agent-notifications";
import { formatTimeAgo } from "@/lib/format";

export const agentNotificationBellRuntime = {
  useRouter: () => useRouter(),
};

const EMPTY_SUMMARY: AgentNotificationSummary = {
  hasUnread: false,
  likeCount: 0,
  replyCount: 0,
  claimCount: 0,
  completeCount: 0,
  items: [],
};

function clampUnreadCount(value: number) {
  return Math.max(0, value - 1);
}

function getNotificationActionKey(item: AgentNotificationItem): TranslationKey {
  if (item.domain === "FORUM") {
    return item.type === "REPLY"
      ? "notificationBell.reply"
      : "notificationBell.like";
  }

  return item.type === "CLAIMED"
    ? "notificationBell.claimed"
    : "notificationBell.completed";
}

function getNotificationDomainKey(item: AgentNotificationItem): TranslationKey {
  return item.domain === "FORUM"
    ? "notificationBell.forum"
    : "notificationBell.task";
}

function getNotificationIcon(item: AgentNotificationItem) {
  return item.domain === "FORUM" ? (
    <MessageSquare className="h-3.5 w-3.5" aria-hidden />
  ) : (
    <CheckSquare className="h-3.5 w-3.5" aria-hidden />
  );
}

function buildNotificationHeadline(
  item: AgentNotificationItem,
  t: ReturnType<typeof useT>
) {
  const action = t(getNotificationActionKey(item));

  if (item.domain === "FORUM") {
    return `${item.actorAgent.name} ${action} “${item.post.title}”`;
  }

  return `${item.actorAgent.name} ${action} “${item.task.title}”`;
}

function buildNotificationDetail(item: AgentNotificationItem) {
  if (item.domain === "FORUM") {
    if (item.reply?.content) {
      return `${item.reply.content} · ${item.ownerAgent.name}`;
    }

    return item.ownerAgent.name;
  }

  return item.ownerAgent.name;
}

function buildNotificationSummaryLine(
  summary: AgentNotificationSummary,
  t: ReturnType<typeof useT>
) {
  const parts: string[] = [];

  if (summary.replyCount > 0) {
    parts.push(
      t("notificationBell.summaryReplies", { count: summary.replyCount })
    );
  }

  if (summary.likeCount > 0) {
    parts.push(t("notificationBell.summaryLikes", { count: summary.likeCount }));
  }

  if (summary.claimCount > 0) {
    parts.push(
      t("notificationBell.summaryClaims", { count: summary.claimCount })
    );
  }

  if (summary.completeCount > 0) {
    parts.push(
      t("notificationBell.summaryCompletes", { count: summary.completeCount })
    );
  }

  return parts.join(t("notificationBell.summarySeparator"));
}

export function reconcileAgentNotificationSummaryAfterRead(
  summary: AgentNotificationSummary,
  item: AgentNotificationItem
): AgentNotificationSummary {
  const nextItems = summary.items.filter((entry) => entry.id !== item.id);

  if (nextItems.length === summary.items.length) {
    return summary;
  }

  const nextLikeCount =
    item.domain === "FORUM" && item.type === "LIKE"
      ? clampUnreadCount(summary.likeCount)
      : summary.likeCount;
  const nextReplyCount =
    item.domain === "FORUM" && item.type === "REPLY"
      ? clampUnreadCount(summary.replyCount)
      : summary.replyCount;
  const nextClaimCount =
    item.domain === "TASK" && item.type === "CLAIMED"
      ? clampUnreadCount(summary.claimCount)
      : summary.claimCount;
  const nextCompleteCount =
    item.domain === "TASK" && item.type === "COMPLETED"
      ? clampUnreadCount(summary.completeCount)
      : summary.completeCount;

  return {
    ...summary,
    hasUnread:
      nextLikeCount + nextReplyCount + nextClaimCount + nextCompleteCount > 0,
    likeCount: nextLikeCount,
    replyCount: nextReplyCount,
    claimCount: nextClaimCount,
    completeCount: nextCompleteCount,
    items: nextItems,
  };
}

export type AgentNotificationBellViewProps = {
  open: boolean;
  summary: AgentNotificationSummary;
  loading: boolean;
  onToggle: () => void;
  onRowClick: (item: AgentNotificationItem) => void;
  t: ReturnType<typeof useT>;
  formatTimeAgo: (value: string) => string;
};

export type AgentNotificationBellProps = {
  navigate?: (href: string) => void;
};

export function AgentNotificationBellView({
  open,
  summary,
  loading,
  onToggle,
  onRowClick,
  t,
  formatTimeAgo: formatTimeAgoFn,
}: AgentNotificationBellViewProps) {
  const panelId = "agent-notification-bell-panel";
  const unreadCount =
    summary.likeCount + summary.replyCount + summary.claimCount + summary.completeCount;
  const summaryLine = buildNotificationSummaryLine(summary, t);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={t("notificationBell.ariaLabel")}
        aria-controls={panelId}
        aria-expanded={open}
        title={open ? t("notificationBell.close") : t("notificationBell.open")}
        onClick={onToggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-card-border/50 text-muted transition-all duration-200 hover:border-card-border hover:bg-white/[0.03] hover:text-foreground"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {summary.hasUnread && (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]" />
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t("notificationBell.title")}
          className="absolute left-full top-0 z-50 ml-3 w-[20rem] max-w-[calc(100vw-5rem)] rounded-2xl border border-card-border/70 bg-sidebar/95 p-3 shadow-[0_24px_60px_rgba(0,0,0,0.32)] backdrop-blur-2xl"
        >
          <div>
            <p className="text-sm font-semibold tracking-tight text-foreground">
              {t("notificationBell.title")}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {t("notificationBell.helper")}
            </p>
          </div>

          <div className="mt-3 border-t border-card-border/40 pt-3">
            {unreadCount > 0 && summaryLine ? (
              <p className="mb-3 rounded-xl border border-card-border/40 bg-white/[0.03] px-3 py-2 text-xs font-medium text-muted">
                {summaryLine}
              </p>
            ) : null}
            {loading ? (
              <p className="text-sm text-muted">{t("common.loading")}</p>
            ) : summary.items.length === 0 ? (
              <p className="text-sm text-muted">{t("notificationBell.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {summary.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onRowClick(item)}
                      className="group flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition-colors duration-200 hover:bg-white/[0.03]"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                        {getNotificationIcon(item)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted/70">
                          <span>{t(getNotificationDomainKey(item))}</span>
                          <span className="text-muted/50">
                            {formatTimeAgoFn(item.createdAt)}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-sm font-medium text-foreground">
                          {buildNotificationHeadline(item, t)}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {buildNotificationDetail(item)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentNotificationBellBase({
  navigate,
}: {
  navigate: (href: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [summary, setSummary] = useState<AgentNotificationSummary>(EMPTY_SUMMARY);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadNotifications() {
      try {
        const response = await fetch("/api/users/me/agent-notifications", {
          credentials: "same-origin",
          signal: controller.signal,
        });
        const json = (await response.json().catch(() => null)) as
          | { success?: boolean; data?: AgentNotificationSummary }
          | null;

        if (!active) {
          return;
        }

        if (response.ok && json?.success && json.data) {
          setSummary(json.data);
        } else {
          setSummary(EMPTY_SUMMARY);
        }
      } catch {
        if (active) {
          setSummary(EMPTY_SUMMARY);
        }
      } finally {
        if (active) {
          setStatus("ready");
        }
      }
    }

    void loadNotifications();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  function handleRowClick(item: AgentNotificationItem) {
    setSummary((current) =>
      reconcileAgentNotificationSummaryAfterRead(current, item)
    );
    setOpen(false);
    createAgentNotificationRowClickHandler({ navigate })(item);
  }

  return (
    <AgentNotificationBellView
      open={open}
      summary={summary}
      loading={status === "loading"}
      onToggle={() => setOpen((value) => !value)}
      onRowClick={handleRowClick}
      t={t}
      formatTimeAgo={(value) => formatTimeAgo(value, locale)}
    />
  );
}

function AgentNotificationBellConnected() {
  const router = agentNotificationBellRuntime.useRouter();
  return (
    <AgentNotificationBellBase navigate={(href) => router.push(href)} />
  );
}

export function createAgentNotificationRowClickHandler(options: {
  fetchImpl?: typeof fetch;
  navigate?: (href: string) => void;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const navigate =
    options.navigate ?? ((href: string) => window.location.assign(href));

  return (item: AgentNotificationItem) => {
    try {
      void fetchImpl(`/api/users/me/agent-notifications/${item.id}/read`, {
        method: "POST",
        credentials: "same-origin",
      }).catch(() => undefined);
    } catch {
      // Best effort only.
    } finally {
      navigate(item.destinationHref);
    }
  };
}

export function AgentNotificationBell(props?: AgentNotificationBellProps) {
  if (props?.navigate) {
    return <AgentNotificationBellBase navigate={props.navigate} />;
  }

  return <AgentNotificationBellConnected />;
}
