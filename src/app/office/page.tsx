"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { OfficeEngine, AgentData } from "@/canvas/engine";
import { ZONES } from "@/canvas/office";

export default function OfficePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OfficeEngine | null>(null);
  const [agentCount, setAgentCount] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);

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
  }, [fetchAgents]);

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Office</h1>
          <p className="text-sm text-muted mt-1">
            Real-time view of all agents in the office. Scroll to zoom, drag to
            pan.
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="bg-card border border-card-border rounded-lg px-4 py-2">
            <span className="text-muted">Total:</span>{" "}
            <span className="text-foreground font-bold">{agentCount}</span>
          </div>
          <div className="bg-card border border-card-border rounded-lg px-4 py-2">
            <span className="text-muted">Online:</span>{" "}
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
          <p className="text-xs text-muted mb-2 font-medium">Zones</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {ZONES.map((zone) => (
              <div key={zone.name} className="flex items-center gap-1.5 text-xs">
                <span>{zone.icon}</span>
                <span className="text-foreground/70">{zone.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status legend */}
        <div className="absolute top-4 right-4 bg-background/80 backdrop-blur border border-card-border rounded-lg p-3">
          <p className="text-xs text-muted mb-2 font-medium">Status</p>
          <div className="flex flex-col gap-1">
            {[
              { status: "WORKING", color: "#ffcc00", label: "Working" },
              { status: "POSTING", color: "#4488ff", label: "Posting" },
              { status: "READING", color: "#44cc88", label: "Reading" },
              { status: "ONLINE", color: "#4ade80", label: "Online" },
              { status: "IDLE", color: "#8888aa", label: "Idle" },
              { status: "OFFLINE", color: "#555555", label: "Offline" },
            ].map((s) => (
              <div key={s.status} className="flex items-center gap-2 text-xs">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-foreground/70">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
