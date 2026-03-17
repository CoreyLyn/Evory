"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { Search, Users, ChevronRight } from "lucide-react";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { STATUS_COLORS } from "@/canvas/theme";
import {
  OFFICE_AGENT_ROW_IDLE_CLASS,
  OFFICE_AGENT_ROW_SELECTED_CLASS,
  OFFICE_FILTER_ACTIVE_CLASS,
  OFFICE_FILTER_IDLE_CLASS,
  OFFICE_HEADER_BADGE_CLASS,
  OFFICE_SEARCH_INPUT_CLASS,
  OFFICE_SIDEBAR_SURFACE_CLASS,
  OFFICE_SIDEBAR_TOGGLE_CLASS,
  getOfficeSearchInputStyle,
  getOfficeSidebarSurfaceStyle,
  getOfficeSidebarToggleStyle,
} from "./overlay-styles";

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
  const { resolvedTheme } = useTheme();
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
        className={`absolute top-6 left-6 z-10 rounded-xl p-3 transition-all group ${OFFICE_SIDEBAR_TOGGLE_CLASS}`}
        style={getOfficeSidebarToggleStyle(resolvedTheme)}
        title={t("office.sidebar.title") as string}
      >
        <Users className="w-5 h-5 text-slate-600 group-hover:text-slate-900 dark:text-foreground/70 dark:group-hover:text-foreground transition-colors" />
        {/* Pulse ring for discoverability */}
        <span className="absolute inset-0 rounded-xl border-2 border-accent/25 animate-ping opacity-30 pointer-events-none" style={{ animationDuration: '3s' }} />
        {/* Count badge */}
        {agents.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-accent text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full">
            {agents.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className={`absolute top-0 left-0 z-10 h-full w-72 flex flex-col ${OFFICE_SIDEBAR_SURFACE_CLASS}`}
      style={getOfficeSidebarSurfaceStyle(resolvedTheme)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border/30">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-foreground/60" />
          <span className="text-sm font-semibold text-foreground/80">
            {t("office.sidebar.title")}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-md ${OFFICE_HEADER_BADGE_CLASS}`}>
            {agents.length}
          </span>
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-slate-900/[0.05] dark:hover:bg-foreground/5 transition-colors"
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
            className={`w-full pl-8 pr-3 py-1.5 text-sm rounded-lg transition-colors ${OFFICE_SEARCH_INPUT_CLASS}`}
            style={getOfficeSearchInputStyle(resolvedTheme)}
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
                  ? OFFICE_FILTER_ACTIVE_CLASS
                  : OFFICE_FILTER_IDLE_CLASS
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
                      ? OFFICE_AGENT_ROW_SELECTED_CLASS
                      : OFFICE_AGENT_ROW_IDLE_CLASS
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[agent.status] ?? "#52525b" }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-800 dark:text-foreground/90 block truncate">
                      {agent.name}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-muted">
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
