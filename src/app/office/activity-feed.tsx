"use client";

import { useState, useMemo, useEffect } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";

export interface FeedItem {
  id: string;
  agentName: string;
  agentId: string;
  action: string;
  detail: string;
  timestamp: number;
}

interface ActivityFeedProps {
  items: FeedItem[];
  onAgentClick: (id: string) => void;
}

const ACTION_LABEL_KEYS: Record<string, TranslationKey> = {
  posted: "office.feed.posted",
  replied: "office.feed.replied",
  claimed: "office.feed.claimed",
  completed: "office.feed.completed",
  verified: "office.feed.verified",
  status: "office.feed.statusChange",
};

const ACTION_COLORS: Record<string, string> = {
  posted: "text-blue-400",
  replied: "text-violet-400",
  claimed: "text-yellow-400",
  completed: "text-emerald-400",
  verified: "text-pink-400",
  status: "text-sky-400",
};

const MAX_VISIBLE = 5;

export function ActivityFeed({ items, onAgentClick }: ActivityFeedProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (items.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [items.length]);

  const visibleItems = useMemo(
    () => expanded ? items.slice(0, 20) : items.slice(0, MAX_VISIBLE),
    [items, expanded]
  );

  const timeLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const item of visibleItems) {
      const secsAgo = Math.floor((now - item.timestamp) / 1000);
      labels[item.id] = secsAgo < 60 ? `${secsAgo}s` : `${Math.floor(secsAgo / 60)}m`;
    }
    return labels;
  }, [visibleItems, now]);

  return (
    <div className={`absolute bottom-0 right-0 sm:bottom-6 sm:right-6 w-full sm:w-72 bg-background/90 sm:bg-background/60 sm:backdrop-blur-xl border border-card-border/50 rounded-none sm:rounded-xl shadow-xl transition-all duration-500 z-10 ${items.length === 0 ? 'opacity-0 pointer-events-none translate-y-2' : 'opacity-90 hover:opacity-100'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-card-border/30">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-foreground/60" />
          <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
            {t("office.feed.title")}
          </span>
          {items.length > 0 && (
            <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold">
              {items.length}
            </span>
          )}
        </div>
        {items.length > MAX_VISIBLE && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded-md hover:bg-foreground/5 transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-muted" />
            )}
          </button>
        )}
      </div>

      {/* Feed list */}
      <div className="max-h-48 overflow-y-auto">
        {visibleItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <Activity className="w-5 h-5 text-muted/40" />
            <p className="text-xs text-muted/70 text-center">
              {t("office.feed.empty")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-card-border/20">
            {visibleItems.map((item) => {
              const actionColor = ACTION_COLORS[item.action] ?? "text-muted";
              const actionLabel = ACTION_LABEL_KEYS[item.action]
                ? t(ACTION_LABEL_KEYS[item.action])
                : item.action;
              const timeLabel = timeLabels[item.id] ?? "0s";

              return (
                <li key={item.id} className="px-4 py-2 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed">
                      <button
                        onClick={() => onAgentClick(item.agentId)}
                        className="font-semibold text-foreground/90 hover:text-primary transition-colors"
                      >
                        {item.agentName}
                      </button>
                      {" "}
                      <span className={actionColor}>{actionLabel}</span>
                      {item.detail && (
                        <span className="text-muted ml-1 truncate">
                          {item.detail}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted/40 flex-shrink-0 mt-0.5">
                    {timeLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
