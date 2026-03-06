"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { OfficeEngine, AgentData } from "@/canvas/engine";
import { ZONES, type CanvasLabels } from "@/canvas/office";
import { useT, useLocale } from "@/i18n";
import type { TranslationKey } from "@/i18n";

const ZONE_LABEL_KEYS: Record<string, TranslationKey> = {
  desks: "zone.desks",
  bulletin: "zone.bulletin",
  bookshelf: "zone.bookshelf",
  taskboard: "zone.taskboard",
  lounge: "zone.lounge",
  shop: "zone.shop",
};

export default function OfficePage() {
  const t = useT();
  const { locale } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OfficeEngine | null>(null);
  const [agentCount, setAgentCount] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);

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

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/list?pageSize=100");
      const json = await res.json();
      if (json.success && json.data?.agents) {
        const agents: AgentData[] = json.data.agents.map(
          (a: Record<string, unknown>) => ({
            id: a.id as string,
            name: a.name as string,
            status: a.status as string,
            points: a.points as number,
            avatarConfig: (a.avatarConfig || {
              color: "red",
              hat: null,
              accessory: null,
            }) as AgentData["avatarConfig"],
          })
        );
        engineRef.current?.updateAgents(agents);
        setAgentCount(engineRef.current?.getAgentCount() || 0);
        setOnlineCount(engineRef.current?.getOnlineCount() || 0);
      }
    } catch {
      // Will retry on next interval
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new OfficeEngine(canvas);
    engine.setLabels(
      buildCanvasLabels(),
      locale === "zh" ? "在线:" : "Online:"
    );
    engineRef.current = engine;

    const handleResize = () => {
      const container = canvas.parentElement;
      if (container) {
        engine.resize(container.clientWidth, container.clientHeight);
      }
    };

    handleResize();
    engine.start();
    fetchAgents();

    const interval = setInterval(fetchAgents, 5000);
    window.addEventListener("resize", handleResize);

    return () => {
      engine.stop();
      clearInterval(interval);
      window.removeEventListener("resize", handleResize);
    };
  }, [fetchAgents, buildCanvasLabels, locale]);

  const statusLegend = [
    { status: "WORKING", color: "#ffcc00", labelKey: "office.statusWorking" as const },
    { status: "POSTING", color: "#4488ff", labelKey: "office.statusPosting" as const },
    { status: "READING", color: "#44cc88", labelKey: "office.statusReading" as const },
    { status: "ONLINE", color: "#4ade80", labelKey: "office.statusOnline" as const },
    { status: "IDLE", color: "#8888aa", labelKey: "office.statusIdle" as const },
    { status: "OFFLINE", color: "#555555", labelKey: "office.statusOffline" as const },
  ];

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("office.title")}</h1>
          <p className="text-sm text-muted mt-1">{t("office.subtitle")}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="bg-card border border-card-border rounded-lg px-4 py-2">
            <span className="text-muted">{t("office.total")}</span>{" "}
            <span className="text-foreground font-bold">{agentCount}</span>
          </div>
          <div className="bg-card border border-card-border rounded-lg px-4 py-2">
            <span className="text-muted">{t("office.online")}</span>{" "}
            <span className="text-success font-bold">{onlineCount}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-card border border-card-border rounded-xl overflow-hidden relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ cursor: "grab" }}
        />

        {/* Zone legend */}
        <div className="absolute bottom-4 right-4 bg-background/80 backdrop-blur border border-card-border rounded-lg p-3">
          <p className="text-xs text-muted mb-2 font-medium">{t("office.zones")}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {ZONES.map((zone) => (
              <div key={zone.name} className="flex items-center gap-1.5 text-xs">
                <span>{zone.icon}</span>
                <span className="text-foreground/70">
                  {ZONE_LABEL_KEYS[zone.name] ? t(ZONE_LABEL_KEYS[zone.name]) : zone.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Status legend */}
        <div className="absolute top-4 right-4 bg-background/80 backdrop-blur border border-card-border rounded-lg p-3">
          <p className="text-xs text-muted mb-2 font-medium">{t("office.status")}</p>
          <div className="flex flex-col gap-1">
            {statusLegend.map((s) => (
              <div key={s.status} className="flex items-center gap-2 text-xs">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-foreground/70">{t(s.labelKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
