"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { Search, Users, ChevronRight } from "lucide-react";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { STATUS_COLORS } from "@/canvas/theme";

export interface SidebarAgent {
  id: string;
  name: string;
  status: string;
  points: number;
  type?: string;
  avatarConfig: { color?: string; hat?: string | null; accessory?: string | null };
}

interface AgentSidebarProps {
  agents: SidebarAgent[];
  selectedAgentId: string | null;
  onAgentClick: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  WORKING: "office.statusWorking",
  POSTING: "office.statusPosting",
  READING: "office.statusReading",
  ONLINE: "office.statusOnline",
  IDLE: "office.statusIdle",
  OFFLINE: "office.statusOffline",
};

const FILTER_OPTIONS = ["ALL", "WORKING", "POSTING", "READING", "ONLINE", "IDLE", "OFFLINE"] as const;

export function AgentSidebar({
  agents,
  selectedAgentId,
  onAgentClick,
  isOpen,
  onToggle,
}: AgentSidebarProps) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const listRef = useRef<HTMLUListElement>(null);

  const focusListItem = useCallback((index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>(":scope > li > button");
    if (buttons && buttons[index]) {
      buttons[index].focus();
    }
  }, []);

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      if (statusFilter !== "ALL" && agent.status !== statusFilter) return false;
      if (search && !agent.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [agents, search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: agents.length };
    for (const agent of agents) {
      counts[agent.status] = (counts[agent.status] ?? 0) + 1;
    }
    return counts;
  }, [agents]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute top-6 left-6 z-10 bg-background/90 sm:bg-background/60 sm:backdrop-blur-xl border border-card-border/50 rounded-xl p-3 shadow-xl hover:bg-background/80 transition-all"
        title={t("office.sidebar.title") as string}
      >
        <Users className="w-5 h-5 text-foreground/70" />
      </button>
    );
  }

  return (
    <div className="absolute top-0 left-0 z-10 h-full w-72 bg-background/95 sm:bg-background/80 sm:backdrop-blur-2xl border-r border-card-border/50 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border/30">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-foreground/60" />
          <span className="text-sm font-semibold text-foreground/80">
            {t("office.sidebar.title")}
          </span>
          <span className="text-xs text-muted bg-foreground/5 px-1.5 py-0.5 rounded-md">
            {agents.length}
          </span>
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-muted rotate-180" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filteredAgents.length > 0) {
                e.preventDefault();
                onAgentClick(filteredAgents[0].id);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                focusListItem(0);
              }
            }}
            placeholder={t("office.sidebar.search") as string}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-card-border/40 bg-foreground/[0.02] text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary/30 transition-colors"
          />
        </div>
      </div>

      {/* Status filter pills */}
      <div className="px-3 pb-2 flex flex-wrap gap-1">
        {FILTER_OPTIONS.map((status) => {
          const count = statusCounts[status] ?? 0;
          const isActive = statusFilter === status;
          const labelKey = status === "ALL"
            ? "office.sidebar.filterAll" as TranslationKey
            : STATUS_LABEL_KEYS[status];
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`text-[11px] px-2 py-0.5 rounded-md font-medium transition-colors ${
                isActive
                  ? "bg-primary/15 text-primary"
                  : "bg-foreground/5 text-muted hover:text-foreground"
              }`}
            >
              {status !== "ALL" && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
              )}
              {t(labelKey)} ({count})
            </button>
          );
        })}
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto px-2">
        {filteredAgents.length === 0 ? (
          <p className="text-sm text-muted/60 text-center py-6">
            {t("office.sidebar.noResults")}
          </p>
        ) : (
          <ul ref={listRef} className="space-y-0.5">
            {filteredAgents.map((agent, i) => (
              <li key={agent.id}>
                <button
                  onClick={() => onAgentClick(agent.id)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      focusListItem(i + 1);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (i > 0) focusListItem(i - 1);
                    }
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
                    selectedAgentId === agent.id
                      ? "bg-primary/10 ring-1 ring-primary/20"
                      : "hover:bg-foreground/[0.03]"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[agent.status] ?? "#52525b" }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground/90 block truncate">
                      {agent.name}
                    </span>
                    <span className="text-[11px] text-muted">
                      {t(STATUS_LABEL_KEYS[agent.status] ?? "office.statusOffline")} · {agent.points} pts
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
