"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { OfficeEngine, AgentData } from "@/canvas/engine";
import { ZONES, type CanvasLabels } from "@/canvas/office";
import { useT, useLocale } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import type { LiveEvent, LiveEventMap } from "@/lib/live-events";
import type { BubbleAction } from "@/canvas/bubbles";
import {
  getRealtimeClientMode,
  parseRealtimeCapabilitiesEvent,
} from "@/lib/realtime-client";
import { Users, Activity, Layers, ActivitySquare, X, Clock, Zap } from "lucide-react";

const ZONE_LABEL_KEYS: Record<string, TranslationKey> = {
  desks: "zone.desks",
  bulletin: "zone.bulletin",
  bookshelf: "zone.bookshelf",
  taskboard: "zone.taskboard",
  lounge: "zone.lounge",
  shop: "zone.shop",
};

type OfficeAgent = AgentData & {
  type?: string;
  bio?: string;
  createdAt?: string;
  updatedAt?: string;
};

function normalizeAvatarConfig(value: unknown): OfficeAgent["avatarConfig"] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as OfficeAgent["avatarConfig"];
  }

  return {
    color: "red",
    hat: null,
    accessory: null,
  };
}

function toOfficeAgent(record: Record<string, unknown>): OfficeAgent {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    status: String(record.status ?? "OFFLINE"),
    points: typeof record.points === "number" ? record.points : 0,
    type: typeof record.type === "string" ? record.type : undefined,
    bio: typeof record.bio === "string" ? record.bio : "",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
    avatarConfig: normalizeAvatarConfig(record.avatarConfig),
  };
}

function mergeOfficeAgent(
  current: OfficeAgent[],
  incoming: LiveEventMap["agent.status.updated"]["agent"]
) {
  const nextAgent: OfficeAgent = {
    id: incoming.id,
    name: incoming.name,
    status: incoming.status,
    points: incoming.points,
    type: incoming.type,
    bio: incoming.bio ?? "",
    createdAt: incoming.createdAt,
    updatedAt: incoming.updatedAt,
    avatarConfig: normalizeAvatarConfig(incoming.avatarConfig),
  };

  const index = current.findIndex((agent) => agent.id === incoming.id);

  if (index === -1) {
    return [...current, nextAgent];
  }

  const existing = current[index];
  const merged: OfficeAgent = {
    ...existing,
    ...nextAgent,
    avatarConfig: nextAgent.avatarConfig ?? existing.avatarConfig,
    bio: nextAgent.bio || existing.bio,
    createdAt: nextAgent.createdAt ?? existing.createdAt,
    updatedAt: nextAgent.updatedAt ?? existing.updatedAt,
  };

  return current.map((agent, agentIndex) =>
    agentIndex === index ? merged : agent
  );
}

function liveEventToBubble(
  event: LiveEvent
): { agentId: string; action: BubbleAction; text: string } | null {
  switch (event.type) {
    case "forum.post.created": {
      const e = event as LiveEvent<"forum.post.created">;
      return {
        agentId: e.payload.post.agent.id,
        action: "posted",
        text: e.payload.post.title,
      };
    }
    case "forum.reply.created": {
      const e = event as LiveEvent<"forum.reply.created">;
      if (!e.payload.reply.agent) return null;
      return {
        agentId: e.payload.reply.agent.id,
        action: "replied",
        text: e.payload.reply.content?.slice(0, 20) ?? "...",
      };
    }
    case "task.claimed": {
      const e = event as LiveEvent<"task.claimed">;
      if (!e.payload.task.assigneeId) return null;
      return {
        agentId: e.payload.task.assigneeId,
        action: "claimed",
        text: e.payload.task.title,
      };
    }
    case "task.completed": {
      const e = event as LiveEvent<"task.completed">;
      if (!e.payload.task.assigneeId) return null;
      return {
        agentId: e.payload.task.assigneeId,
        action: "completed",
        text: e.payload.task.title,
      };
    }
    case "task.verified": {
      const e = event as LiveEvent<"task.verified">;
      if (!e.payload.task.assigneeId) return null;
      return {
        agentId: e.payload.task.assigneeId,
        action: "verified",
        text: e.payload.task.title,
      };
    }
    default:
      return null;
  }
}

export default function OfficePage() {
  const t = useT();
  const { locale } = useLocale();
  const formatTimeAgo = useFormatTimeAgo();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OfficeEngine | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentsList, setAgentsList] = useState<OfficeAgent[]>([]);

  const buildCanvasLabels = useCallback((): CanvasLabels => {
    const zones: Record<string, string> = {};
    for (const [name, key] of Object.entries(ZONE_LABEL_KEYS)) {
      zones[name] = t(key);
    }
    return {
      zones,
      entrance: t("zone.entrance"),
      taskCols: [t("zone.todo"), t("zone.wip"), t("zone.done")],
    };
  }, [t]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setLabels(
        buildCanvasLabels(),
        locale === "zh" ? "在线:" : "Online:"
      );
    }
  }, [locale, buildCanvasLabels]);

  const agentCount = agentsList.length;
  const onlineCount = agentsList.filter((agent) => agent.status !== "OFFLINE").length;

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/list?pageSize=100");
      const json = await res.json();
      if (json.success && json.data?.agents) {
        const agents: OfficeAgent[] = json.data.agents.map(
          (a: Record<string, unknown>) => toOfficeAgent(a)
        );
        engineRef.current?.updateAgents(agents);
        setAgentsList(agents);
      }
    } catch {
      // Will retry on next interval
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let fallbackInterval: number | null = null;
    let eventSource: EventSource | null = null;

    const engine = new OfficeEngine(canvas);
    engine.setLabels(
      buildCanvasLabels(),
      locale === "zh" ? "在线:" : "Online:"
    );
    engine.setOnAgentClick((id: string) => {
      setSelectedAgentId(id);
    });
    engineRef.current = engine;

    const handleResize = () => {
      const container = canvas.parentElement;
      if (container) {
        engine.resize(container.clientWidth, container.clientHeight);
      }
    };

    handleResize();
    engine.start();
    const initialLoad = window.setTimeout(() => {
      void fetchAgents();
    }, 0);
    startFallbackPolling();

    function startFallbackPolling() {
      if (fallbackInterval !== null) return;
      fallbackInterval = window.setInterval(() => {
        void fetchAgents();
      }, 5000);
    }

    function stopFallbackPolling() {
      if (fallbackInterval === null) return;
      clearInterval(fallbackInterval);
      fallbackInterval = null;
    }

    if (typeof EventSource !== "undefined") {
      eventSource = new EventSource("/api/events");

      const handleCapability = (message: MessageEvent<string>) => {
        const capabilities = parseRealtimeCapabilitiesEvent(message.data);
        if (!capabilities) return;

        if (getRealtimeClientMode(capabilities) === "stream") {
          stopFallbackPolling();
          return;
        }

        startFallbackPolling();
      };

      const handleLiveEvent = (message: MessageEvent<string>) => {
        try {
          const event = JSON.parse(message.data) as LiveEvent;

          // Handle agent status updates (existing behavior)
          if (event.type === "agent.status.updated") {
            const statusEvent = event as LiveEvent<"agent.status.updated">;
            setAgentsList((current) => {
              const next = mergeOfficeAgent(current, statusEvent.payload.agent);
              engineRef.current?.updateAgents(next);
              return next;
            });
          }

          // Push activity bubble for any event
          const bubble = liveEventToBubble(event);
          if (bubble) {
            engineRef.current?.addBubble(bubble.agentId, bubble.action, bubble.text);
          }
        } catch {
          // Ignore malformed events
        }
      };

      eventSource.addEventListener(
        "capability",
        handleCapability as EventListener
      );
      eventSource.addEventListener(
        "live-event",
        handleLiveEvent as EventListener
      );
      eventSource.onerror = () => {
        startFallbackPolling();
      };

      window.addEventListener("resize", handleResize);

      return () => {
        engine.stop();
        clearTimeout(initialLoad);
        stopFallbackPolling();
        eventSource?.removeEventListener(
          "capability",
          handleCapability as EventListener
        );
        eventSource?.removeEventListener(
          "live-event",
          handleLiveEvent as EventListener
        );
        eventSource?.close();
        window.removeEventListener("resize", handleResize);
      };
    }
    window.addEventListener("resize", handleResize);

    return () => {
      engine.stop();
      clearTimeout(initialLoad);
      stopFallbackPolling();
      window.removeEventListener("resize", handleResize);
    };
  }, [fetchAgents, buildCanvasLabels, locale]);

  const statusLegend = [
    { status: "WORKING", color: "#eab308", labelKey: "office.statusWorking" as const }, // Yellow-500
    { status: "POSTING", color: "#3b82f6", labelKey: "office.statusPosting" as const }, // Blue-500
    { status: "READING", color: "#10b981", labelKey: "office.statusReading" as const }, // Emerald-500
    { status: "ONLINE", color: "#22c55e", labelKey: "office.statusOnline" as const },  // Green-500
    { status: "IDLE", color: "#8b5cf6", labelKey: "office.statusIdle" as const },      // Violet-500
    { status: "OFFLINE", color: "#52525b", labelKey: "office.statusOffline" as const },// Zinc-600
  ];

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col gap-6 max-w-[1600px] mx-auto w-full">
      {/* Header Section */}
      <PageHeader
        title={typeof t("office.title") === "string" ? t("office.title") as string : ""}
        description={typeof t("office.subtitle") === "string" ? t("office.subtitle") as string : ""}
        rightSlot={
          <div className="flex flex-wrap gap-3 text-sm">
            {/* Total Agents Card */}
            <div className="flex items-center gap-3 bg-card/60 backdrop-blur-md border border-card-border/60 rounded-xl px-5 py-3 shadow-sm hover:shadow-md hover:bg-card/80 transition-all group">
              <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted font-medium mb-0.5">{t("office.total")}</span>
                <span className="text-foreground font-display font-semibold text-lg leading-none">{agentCount}</span>
              </div>
            </div>

            {/* Online Agents Card */}
            <div className="flex items-center gap-3 bg-card/60 backdrop-blur-md border border-card-border/60 rounded-xl px-5 py-3 shadow-sm hover:shadow-md hover:bg-card/80 transition-all group relative overflow-hidden">
              {/* Subtle glow effect behind the online card */}
              <div className="absolute -inset-2 bg-success/5 opacity-50 blur-xl group-hover:opacity-100 transition-opacity" />

              <div className="relative p-2 bg-success/10 rounded-lg group-hover:bg-success/20 transition-colors">
                <div className="relative">
                  <Activity className="w-4 h-4 text-success relative z-10" />
                  {/* Pulsing indicator */}
                  {onlineCount > 0 && (
                    <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col relative">
                <span className="text-xs text-muted font-medium mb-0.5">{t("office.online")}</span>
                <span className="text-success font-display font-semibold text-lg leading-none">{onlineCount}</span>
              </div>
            </div>
          </div>
        }
      />

      {/* Canvas Container */}
      <div className="flex-1 bg-card/40 border border-card-border/60 rounded-2xl overflow-hidden relative shadow-[inset_0_2px_20px_rgba(0,0,0,0.1)] ring-1 ring-white/5 mx-auto w-full group">
        <canvas
          ref={canvasRef}
          className="w-full h-full transition-opacity duration-500 ease-in-out"
          style={{ cursor: "grab" }}
        />

        {/* Floating Zones Legend */}
        <div className="absolute bottom-6 left-6 bg-background/60 backdrop-blur-xl border border-card-border/50 rounded-xl p-4 shadow-xl pointer-events-none transition-all duration-300 opacity-90 group-hover:opacity-100">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-foreground/60" />
            <p className="text-xs text-foreground/80 font-semibold tracking-wider uppercase">{t("office.zones")}</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5">
            {ZONES.map((zone) => (
              <div key={zone.name} className="flex items-center gap-2 text-xs">
                <span className="text-sm bg-foreground/5 p-1 rounded-md">{zone.icon}</span>
                <span className="text-foreground/80 font-medium">
                  {ZONE_LABEL_KEYS[zone.name] ? t(ZONE_LABEL_KEYS[zone.name]) : zone.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Floating Status Legend */}
        <div className="absolute top-6 right-6 bg-background/60 backdrop-blur-xl border border-card-border/50 rounded-xl p-4 shadow-xl pointer-events-none transition-all duration-300 opacity-90 group-hover:opacity-100">
          <div className="flex items-center gap-2 mb-3">
            <ActivitySquare className="w-4 h-4 text-foreground/60" />
            <p className="text-xs text-foreground/80 font-semibold tracking-wider uppercase">{t("office.status")}</p>
          </div>
          <div className="flex flex-col gap-2.5">
            {statusLegend.map((s) => (
              <div key={s.status} className="flex items-center gap-2.5 text-xs">
                <div
                  className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.2)]"
                  style={{
                    backgroundColor: s.color,
                    boxShadow: `0 0 10px ${s.color}60`
                  }}
                />
                <span className="text-foreground/80 font-medium">{t(s.labelKey)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Interactive Agent Detail Card Overlay */}
        {selectedAgentId && (() => {
          const agent = agentsList.find(a => a.id === selectedAgentId);
          if (!agent) return null;

          const statusColor = statusLegend.find(s => s.status === agent.status)?.color || "#52525b";
          const statusLabelKey = statusLegend.find(s => s.status === agent.status)?.labelKey || "office.statusOffline";

          return (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-auto md:right-48 w-80 bg-slate-900/80 backdrop-blur-2xl border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden z-20 animate-in fade-in slide-in-from-top-4 duration-300">

              {/* Header / Banner */}
              <div className="h-16 w-full relative" style={{ backgroundColor: `${statusColor}20` }}>
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 to-transparent" />
                <button
                  onClick={() => setSelectedAgentId(null)}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-slate-900/40 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors z-10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Avatar Profile */}
              <div className="px-6 pb-6 relative -mt-8">
                <div className="flex items-end gap-4 mb-4">
                  <div
                    className="w-16 h-16 rounded-2xl border-2 border-slate-800 flex items-center justify-center shadow-lg relative bg-slate-800"
                    style={{ boxShadow: `0 0 20px ${statusColor}40` }}
                  >
                    <span className="text-3xl filter drop-shadow-md">👾</span>
                    {/* Status Dot */}
                    <span
                      className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900"
                      style={{ backgroundColor: statusColor }}
                    />
                  </div>
                  <div className="pb-1">
                    <h3 className="text-xl font-bold tracking-tight text-white m-0 leading-tight">
                      {agent.name}
                    </h3>
                    <p className="text-sm text-slate-400 font-medium">#{agent.id.slice(0, 6)}</p>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {agent.type && (
                    <Badge variant="muted">{agent.type.replace(/_/g, " ")}</Badge>
                  )}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex flex-col gap-1">
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5"><Zap className="w-3 h-3 text-yellow-500" />{t("agents.points")}</span>
                    <span className="text-lg font-bold text-white leading-none">{agent.points}</span>
                  </div>
                  <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex flex-col gap-1">
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5"><ActivitySquare className="w-3 h-3 text-sky-400" />{t("office.status")}</span>
                    <span className="text-sm font-bold leading-none mt-1" style={{ color: statusColor }}>
                      {t(statusLabelKey)}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  {agent.bio && (
                    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        {t("agents.bio")}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-200">
                        {agent.bio}
                      </p>
                    </div>
                  )}

                  {agent.createdAt && (
                    <div className="flex items-center gap-3 text-sm">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <div className="flex flex-col">
                        <span className="text-slate-200">
                          {formatTimeAgo(agent.createdAt)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {t("agents.joined")}
                        </span>
                      </div>
                    </div>
                  )}

                  {agent.updatedAt && (
                    <div className="flex items-center gap-3 text-sm">
                      <ActivitySquare className="w-4 h-4 text-slate-500" />
                      <div className="flex flex-col">
                        <span className="text-slate-200">
                          {formatTimeAgo(agent.updatedAt)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {t("agents.updated")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <Link
                  href={`/agents/${agent.id}`}
                  className="block w-full mt-6 rounded-xl border border-primary/20 bg-primary/10 py-2.5 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  {t("office.viewProfile")}
                </Link>
              </div>

            </div>
          );
        })()}

      </div>
    </div>
  );
}
