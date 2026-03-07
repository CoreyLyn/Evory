import { drawLobster, drawNameTag, LobsterAppearance } from "./sprites";
import {
  drawOffice,
  OFFICE_WIDTH,
  OFFICE_HEIGHT,
  AgentPosition,
  updateAgentPosition,
  getZoneForStatus,
  getRandomPositionInZone,
  DEFAULT_LABELS,
  type CanvasLabels,
} from "./office";

export interface AgentData {
  id: string;
  name: string;
  status: string;
  points: number;
  avatarConfig: { color?: string; hat?: string | null; accessory?: string | null };
}

export class OfficeEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private agents: Map<string, AgentPosition> = new Map();
  private animationId: number | null = null;
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private hoveredAgent: string | null = null;
  private labels: CanvasLabels = DEFAULT_LABELS;
  private hudOnline: string = "Online:";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.setupEvents();
  }

  setLabels(labels: CanvasLabels, hudOnline?: string) {
    this.labels = labels;
    if (hudOnline) this.hudOnline = hudOnline;
  }

  private setupEvents() {
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05;
      const newScale = Math.min(3, Math.max(0.5, this.scale * zoomFactor));

      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      this.offsetX = mx - (mx - this.offsetX) * (newScale / this.scale);
      this.offsetY = my - (my - this.offsetY) * (newScale / this.scale);
      this.scale = newScale;
    });

    this.canvas.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.style.cursor = "grabbing";
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (this.isDragging) {
        this.offsetX += e.clientX - this.lastMouseX;
        this.offsetY += e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }

      const rect = this.canvas.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - this.offsetX) / this.scale;
      const worldY = (e.clientY - rect.top - this.offsetY) / this.scale;

      this.hoveredAgent = null;
      for (const [id, agent] of this.agents) {
        const dx = worldX - agent.x;
        const dy = worldY - agent.y;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 25) {
          this.hoveredAgent = id;
          break;
        }
      }

      if (!this.isDragging) {
        this.canvas.style.cursor = this.hoveredAgent ? "pointer" : "grab";
      }
    });

    this.canvas.addEventListener("mouseup", () => {
      this.isDragging = false;
      this.canvas.style.cursor = this.hoveredAgent ? "pointer" : "grab";
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.isDragging = false;
      this.canvas.style.cursor = "grab";
    });
  }

  updateAgents(agentDataList: AgentData[]) {
    const existingIds = new Set(this.agents.keys());

    for (const data of agentDataList) {
      const existing = this.agents.get(data.id);
      const appearance: LobsterAppearance = {
        color: data.avatarConfig?.color || "red",
        hat: data.avatarConfig?.hat || null,
        accessory: data.avatarConfig?.accessory || null,
      };

      if (existing) {
        existingIds.delete(data.id);

        if (existing.status !== data.status) {
          const zone = getZoneForStatus(data.status);
          const pos = getRandomPositionInZone(zone);
          existing.status = data.status;
          existing.targetX = pos.x;
          existing.targetY = pos.y;
        }
        existing.name = data.name;
        existing.points = data.points;
        existing.appearance = appearance;
      } else {
        const zone = getZoneForStatus(data.status);
        const pos = getRandomPositionInZone(zone);
        this.agents.set(data.id, {
          id: data.id,
          name: data.name,
          status: data.status,
          points: data.points,
          appearance,
          x: pos.x,
          y: pos.y,
          targetX: pos.x,
          targetY: pos.y,
          frame: Math.floor(Math.random() * 1000),
        });
      }
    }

    for (const id of existingIds) {
      this.agents.delete(id);
    }
  }

  start() {
    const render = () => {
      this.update();
      this.draw();
      this.animationId = requestAnimationFrame(render);
    };
    this.animationId = requestAnimationFrame(render);
  }

  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = false;

    if (this.offsetX === 0 && this.offsetY === 0) {
      this.scale = Math.min(width / OFFICE_WIDTH, height / OFFICE_HEIGHT) * 0.9;
      this.offsetX = (width - OFFICE_WIDTH * this.scale) / 2;
      this.offsetY = (height - OFFICE_HEIGHT * this.scale) / 2;
    }
  }

  private update() {
    for (const [id, agent] of this.agents) {
      this.agents.set(id, updateAgentPosition(agent));
    }
  }

  private draw() {
    const { ctx, canvas } = this;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Base clear color that blends into the office background
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    drawOffice(ctx, this.labels);

    const sortedAgents = Array.from(this.agents.values()).sort((a, b) => a.y - b.y);

    for (const agent of sortedAgents) {
      const isHovered = this.hoveredAgent === agent.id;
      const spriteScale = isHovered ? 2.3 : 2;
      drawLobster(ctx, agent.x, agent.y, agent.appearance, agent.status, agent.frame, spriteScale);
      drawNameTag(ctx, agent.x, agent.y, agent.name, agent.points, spriteScale);
    }

    ctx.restore();

    // HUD overlay
    const onlineCount = Array.from(this.agents.values()).filter(a => a.status !== "OFFLINE").length;
    const totalCount = this.agents.size;
    const hudText = `${this.hudOnline} ${onlineCount} / ${totalCount}`;

    ctx.save();
    ctx.font = "12px system-ui, -apple-system, sans-serif";

    // Measure text for pill width
    const textMetrics = ctx.measureText(hudText);
    const pillWidth = textMetrics.width + 24;
    const pillHeight = 28;
    const pillX = 16;
    const pillY = canvas.height - pillHeight - 16;

    // HUD Pill Background
    ctx.fillStyle = "rgba(15, 23, 42, 0.7)"; // slate-900 / 0.7
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 14);
    ctx.fill();
    ctx.shadowBlur = 0;

    // HUD Pill Border
    ctx.strokeStyle = "rgba(51, 65, 85, 0.5)"; // slate-700
    ctx.lineWidth = 1;
    ctx.stroke();

    // HUD Text
    ctx.fillStyle = "rgba(241, 245, 249, 0.9)"; // slate-100
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(hudText, pillX + 12, pillY + pillHeight / 2);

    // Status Indicator Dot
    ctx.fillStyle = "rgba(34, 197, 94, 0.9)"; // green-500
    ctx.shadowColor = "rgba(34, 197, 94, 0.6)";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(pillX + pillWidth - 14, pillY + pillHeight / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  getAgentCount() {
    return this.agents.size;
  }

  getOnlineCount() {
    return Array.from(this.agents.values()).filter(a => a.status !== "OFFLINE").length;
  }
}
