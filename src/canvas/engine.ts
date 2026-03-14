import { ActivityBubble, updateBubbles, drawBubble, createBubble, BubbleAction } from "./bubbles";
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
  private bgCanvas: HTMLCanvasElement;
  private bgCtx: CanvasRenderingContext2D;
  private lastBgRenderTime: number = 0;
  private agents: Map<string, AgentPosition> = new Map();
  private animationId: number | null = null;
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private hoveredAgent: string | null = null;
  private bubbles: ActivityBubble[] = [];
  private bgThrottleMs: number = 50; // default: 50ms (~20fps)
  private labels: CanvasLabels = DEFAULT_LABELS;
  private hudOnline: string = "Online:";
  private onAgentClick?: (id: string) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;

    // Initialize offscreen canvas for caching the background
    this.bgCanvas = document.createElement("canvas");
    this.bgCanvas.width = OFFICE_WIDTH;
    this.bgCanvas.height = OFFICE_HEIGHT;
    this.bgCtx = this.bgCanvas.getContext("2d")!;
    this.bgCtx.imageSmoothingEnabled = false;

    this.setupEvents();
  }

  setLabels(labels: CanvasLabels, hudOnline?: string) {
    this.labels = labels;
    if (hudOnline) this.hudOnline = hudOnline;
    this.lastBgRenderTime = 0; // Force redraw on label change
  }

  setOnAgentClick(callback: (id: string) => void) {
    this.onAgentClick = callback;
  }

  addBubble(agentId: string, action: BubbleAction, text: string) {
    // Max 1 bubble per agent at a time — replace existing
    this.bubbles = this.bubbles.filter(b => b.agentId !== agentId);
    this.bubbles.push(createBubble(agentId, action, text));
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

    this.canvas.addEventListener("click", () => {
      if (this.hoveredAgent && this.onAgentClick) {
        this.onAgentClick(this.hoveredAgent);
      }
    });

    // --- Touch Support ---
    let lastTouchDist = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchDragging = false;

    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        isTouchDragging = true;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        touchStartX = lastTouchX;
        touchStartY = lastTouchY;
      } else if (e.touches.length === 2) {
        isTouchDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: false });

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && isTouchDragging) {
        const tx = e.touches[0].clientX;
        const ty = e.touches[0].clientY;
        this.offsetX += tx - lastTouchX;
        this.offsetY += ty - lastTouchY;
        lastTouchX = tx;
        lastTouchY = ty;
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastTouchDist > 0) {
          const pinchRatio = dist / lastTouchDist;
          const newScale = Math.min(3, Math.max(0.5, this.scale * pinchRatio));
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const rect = this.canvas.getBoundingClientRect();
          const mx = midX - rect.left;
          const my = midY - rect.top;
          this.offsetX = mx - (mx - this.offsetX) * (newScale / this.scale);
          this.offsetY = my - (my - this.offsetY) * (newScale / this.scale);
          this.scale = newScale;
        }
        lastTouchDist = dist;
      }
    }, { passive: false });

    this.canvas.addEventListener("touchend", (e) => {
      if (e.touches.length === 0) {
        // Tap detection: only treat as tap if total drag distance was minimal
        const totalDist = Math.hypot(lastTouchX - touchStartX, lastTouchY - touchStartY);
        if (isTouchDragging && totalDist < 10 && this.onAgentClick) {
          // Compute tapped agent from touch coordinates (hoveredAgent is mouse-only)
          const rect = this.canvas.getBoundingClientRect();
          const worldX = (lastTouchX - rect.left - this.offsetX) / this.scale;
          const worldY = (lastTouchY - rect.top - this.offsetY) / this.scale;
          for (const [id, agent] of this.agents) {
            if (Math.abs(worldX - agent.x) < 20 && Math.abs(worldY - agent.y) < 25) {
              this.onAgentClick(id);
              break;
            }
          }
        }
        isTouchDragging = false;
        lastTouchDist = 0;
      } else if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        isTouchDragging = true;
        lastTouchDist = 0;
      }
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
    this.lastBgRenderTime = 0; // Force initial render
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

    // Force a background redraw on next frame
    this.lastBgRenderTime = 0;
  }

  private update() {
    let anyMoving = false;
    for (const [id, agent] of this.agents) {
      const updated = updateAgentPosition(agent);
      this.agents.set(id, updated);
      const dx = updated.targetX - updated.x;
      const dy = updated.targetY - updated.y;
      if (Math.sqrt(dx * dx + dy * dy) > 2) anyMoving = true;
    }
    this.bubbles = updateBubbles(this.bubbles);

    // Throttle background redraws: 50ms when active, 200ms when quiet
    this.bgThrottleMs = (anyMoving || this.bubbles.length > 0) ? 50 : 200;
  }

  private draw() {
    const { ctx, canvas } = this;
    const now = Date.now();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Base clear color that blends into the office background
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Throttled Background Rendering (Cache to Offscreen Canvas)
    // Redraw at most every bgThrottleMs: 50ms (~20 FPS) when active, 200ms (~5 FPS) when quiet
    if (now - this.lastBgRenderTime > this.bgThrottleMs) {
      this.bgCtx.clearRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);
      drawOffice(this.bgCtx, this.labels, now);
      this.lastBgRenderTime = now;
    }

    // Draw the cached background
    ctx.drawImage(this.bgCanvas, 0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);

    // Calculate Frustum Culling Viewport
    // How much of the world is currently visible on the screen?
    const viewWorldMinX = -this.offsetX / this.scale;
    const viewWorldMinY = -this.offsetY / this.scale;
    const viewWorldMaxX = viewWorldMinX + canvas.width / this.scale;
    const viewWorldMaxY = viewWorldMinY + canvas.height / this.scale;

    // Sprite drawing bounds padding (agents are roughly 60x60 max with shadows/names)
    const renderPadding = 60;

    const sortedAgents = Array.from(this.agents.values()).sort((a, b) => a.y - b.y);

    for (const agent of sortedAgents) {
      // Frustum Culling: Skip if completely off-screen
      if (
        agent.x + renderPadding < viewWorldMinX ||
        agent.x - renderPadding > viewWorldMaxX ||
        agent.y + renderPadding < viewWorldMinY ||
        agent.y - renderPadding > viewWorldMaxY
      ) {
        continue;
      }

      const isHovered = this.hoveredAgent === agent.id;
      const spriteScale = isHovered ? 2.3 : 2;
      // Pass isHovered for the selection ring and drop shadow animations
      drawLobster(ctx, agent.x, agent.y, agent.appearance, agent.status, agent.frame, spriteScale, isHovered);
      // Pass the global engine scale and hover state for LOD (Level of Detail) rendering
      drawNameTag(ctx, agent.x, agent.y, agent.name, agent.points, spriteScale, this.scale, isHovered);

      const agentBubbles = this.bubbles.filter(b => b.agentId === agent.id);
      for (const bubble of agentBubbles) {
        drawBubble(ctx, agent.x, agent.y, bubble, spriteScale);
      }
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

    // Status Indicator Dot (Pulsing)
    ctx.fillStyle = "rgba(34, 197, 94, 0.9)"; // green-500
    const pulseFade = ((Math.sin(now / 300) + 1) / 2);
    ctx.shadowColor = `rgba(34, 197, 94, ${0.4 + pulseFade * 0.4})`;
    ctx.shadowBlur = 4 + pulseFade * 4;
    ctx.beginPath();
    ctx.arc(pillX + pillWidth - 14, pillY + pillHeight / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  focusAgent(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    // Center the viewport on the agent with a smooth zoom
    const targetScale = 2;
    this.scale = targetScale;
    this.offsetX = this.canvas.width / 2 - agent.x * targetScale;
    this.offsetY = this.canvas.height / 2 - agent.y * targetScale;
  }

  getAgentCount() {
    return this.agents.size;
  }

  getOnlineCount() {
    return Array.from(this.agents.values()).filter(a => a.status !== "OFFLINE").length;
  }
}
