import { ActivityBubble, updateBubbles, drawBubble, createBubble, BubbleAction } from "./bubbles";
import { drawLobster, drawNameTag, LobsterAppearance, cachedMeasureText } from "./sprites";
import {
  drawStaticBackground,
  drawAnimatedOverlay,
  OFFICE_WIDTH,
  OFFICE_HEIGHT,
  AgentPosition,
  updateAgentPosition,
  getZoneForStatus,
  getRandomPositionInZone,
  DEFAULT_LABELS,
  type CanvasLabels,
} from "./office";
import { CANVAS_FONTS } from "./theme";

// Static HUD rgba constants — avoid per-frame allocation
const HUD_BG = "rgba(15, 23, 42, 0.7)";
const HUD_SHADOW = "rgba(0, 0, 0, 0.3)";
const HUD_BORDER = "rgba(51, 65, 85, 0.5)";
const HUD_TEXT_COLOR = "rgba(241, 245, 249, 0.9)";
const HUD_DOT_COLOR = "rgba(34, 197, 94, 0.9)";
const HUD_DOT_HEX = "#22c55e";

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
  private staticCanvas: HTMLCanvasElement;
  private staticCtx: CanvasRenderingContext2D;
  private staticReady: boolean = false;
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
  private onEmptyClick?: () => void;
  private abortController = new AbortController();
  private sortedAgents: AgentPosition[] = [];
  private bubbleMap: Map<string, ActivityBubble> = new Map();
  private onlineCount: number = 0;
  private focusTarget: { x: number; y: number; scale: number } | null = null;
  private dpr: number = 1;
  private logicalWidth: number = 0;
  private logicalHeight: number = 0;
  private dirty: boolean = true;
  private idleFrames: number = 0;
  private idleInterval: ReturnType<typeof setInterval> | null = null;
  private isIdleMode: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;

    // Initialize offscreen canvases — sized in resize() with DPR
    this.bgCanvas = document.createElement("canvas");
    this.bgCtx = this.bgCanvas.getContext("2d")!;
    this.bgCtx.imageSmoothingEnabled = false;

    this.staticCanvas = document.createElement("canvas");
    this.staticCtx = this.staticCanvas.getContext("2d")!;
    this.staticCtx.imageSmoothingEnabled = false;

    this.setupEvents();
  }

  setLabels(labels: CanvasLabels, hudOnline?: string) {
    this.labels = labels;
    if (hudOnline) this.hudOnline = hudOnline;
    this.lastBgRenderTime = 0; // Force redraw on label change
    this.staticReady = false; // Invalidate static cache
    this.dirty = true;
  }

  setOnAgentClick(callback: (id: string) => void) {
    this.onAgentClick = callback;
  }

  setOnEmptyClick(callback: () => void) {
    this.onEmptyClick = callback;
  }

  /** Wake up from idle polling mode back to rAF loop */
  private wake() {
    if (!this.isIdleMode) return;
    this.isIdleMode = false;
    if (this.idleInterval !== null) {
      clearInterval(this.idleInterval);
      this.idleInterval = null;
    }
    this.start();
  }

  addBubble(agentId: string, action: BubbleAction, text: string) {
    // Max 1 bubble per agent at a time — replace existing
    this.bubbles = this.bubbles.filter(b => b.agentId !== agentId);
    this.bubbles.push(createBubble(agentId, action, text));
    this.dirty = true;
    this.wake();
  }

  private setupEvents() {
    const opts = { signal: this.abortController.signal };

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
      this.dirty = true;
      this.focusTarget = null;
    }, opts);

    this.canvas.addEventListener("mousedown", (e) => {
      this.dirty = true;
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.style.cursor = "grabbing";
      this.focusTarget = null;
    }, opts);

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

      const prevHovered = this.hoveredAgent;
      this.hoveredAgent = null;
      const hitX = Math.max(10, 20 / this.scale);
      const hitY = Math.max(12, 25 / this.scale);
      for (const [id, agent] of this.agents) {
        const dx = worldX - agent.x;
        const dy = worldY - agent.y;
        if (Math.abs(dx) < hitX && Math.abs(dy) < hitY) {
          this.hoveredAgent = id;
          break;
        }
      }

      if (this.hoveredAgent !== prevHovered) this.dirty = true;

      if (!this.isDragging) {
        this.canvas.style.cursor = this.hoveredAgent ? "pointer" : "grab";
      }
    }, opts);

    this.canvas.addEventListener("mouseup", () => {
      this.isDragging = false;
      this.canvas.style.cursor = this.hoveredAgent ? "pointer" : "grab";
    }, opts);

    this.canvas.addEventListener("mouseleave", () => {
      this.isDragging = false;
      this.canvas.style.cursor = "grab";
    }, opts);

    this.canvas.addEventListener("click", () => {
      if (this.hoveredAgent && this.onAgentClick) {
        this.onAgentClick(this.hoveredAgent);
      } else if (!this.hoveredAgent && this.onEmptyClick) {
        this.onEmptyClick();
      }
    }, opts);

    // --- Touch Support ---
    let lastTouchDist = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchDragging = false;

    this.canvas.addEventListener("touchstart", (e) => {
      this.dirty = true;
      e.preventDefault();
      if (e.touches.length === 1) {
        isTouchDragging = true;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        touchStartX = lastTouchX;
        touchStartY = lastTouchY;
        this.focusTarget = null;
      } else if (e.touches.length === 2) {
        isTouchDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: false, signal: this.abortController.signal });

    this.canvas.addEventListener("touchmove", (e) => {
      this.dirty = true;
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
    }, { passive: false, signal: this.abortController.signal });

    this.canvas.addEventListener("touchend", (e) => {
      if (e.touches.length === 0) {
        // Tap detection: only treat as tap if total drag distance was minimal
        const totalDist = Math.hypot(lastTouchX - touchStartX, lastTouchY - touchStartY);
        if (isTouchDragging && totalDist < 18) {
          // Compute tapped agent from touch coordinates (hoveredAgent is mouse-only)
          const rect = this.canvas.getBoundingClientRect();
          const worldX = (lastTouchX - rect.left - this.offsetX) / this.scale;
          const worldY = (lastTouchY - rect.top - this.offsetY) / this.scale;
          const touchHitX = Math.max(10, 20 / this.scale);
          const touchHitY = Math.max(12, 25 / this.scale);
          let tapped = false;
          for (const [id, agent] of this.agents) {
            if (Math.abs(worldX - agent.x) < touchHitX && Math.abs(worldY - agent.y) < touchHitY) {
              if (this.onAgentClick) this.onAgentClick(id);
              tapped = true;
              break;
            }
          }
          if (!tapped && this.onEmptyClick) {
            this.onEmptyClick();
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
    }, opts);
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
          phaseOffset: Math.random() * Math.PI * 2,
        });
      }
    }

    for (const id of existingIds) {
      this.agents.delete(id);
    }

    // Track online count for HUD
    this.onlineCount = 0;
    for (const agent of this.agents.values()) {
      if (agent.status !== "OFFLINE") this.onlineCount++;
    }

    this.dirty = true;
    this.wake();
  }

  start() {
    if (this.isIdleMode) return; // Don't start rAF while in idle polling mode
    this.lastBgRenderTime = 0;
    const render = () => {
      this.update();

      // Skip drawing if scene is stable
      const isActive = this.dirty ||
        this.bubbles.length > 0 ||
        this.focusTarget !== null;

      if (isActive) {
        this.draw();
        this.dirty = false;
        this.idleFrames = 0;
      } else {
        this.idleFrames++;
      }

      // Switch to idle polling after ~2 seconds of inactivity (120 frames)
      if (this.idleFrames > 120) {
        this.animationId = null;
        this.isIdleMode = true;
        this.idleInterval = setInterval(() => {
          if (this.dirty || this.bubbles.length > 0 || this.focusTarget !== null) {
            this.wake();
          }
        }, 500);
        return;
      }

      this.animationId = requestAnimationFrame(render);
    };
    this.animationId = requestAnimationFrame(render);
  }

  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.idleInterval !== null) {
      clearInterval(this.idleInterval);
      this.idleInterval = null;
    }
    this.isIdleMode = false;
  }

  destroy() {
    this.stop();
    this.abortController.abort();
  }

  resize(width: number, height: number) {
    this.dpr = window.devicePixelRatio || 1;
    this.logicalWidth = width;
    this.logicalHeight = height;

    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.imageSmoothingEnabled = false;

    // Scale offscreen canvases by DPR for Retina sharpness
    const ow = OFFICE_WIDTH * this.dpr;
    const oh = OFFICE_HEIGHT * this.dpr;
    this.bgCanvas.width = ow;
    this.bgCanvas.height = oh;
    this.bgCtx.imageSmoothingEnabled = false;
    this.bgCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.staticCanvas.width = ow;
    this.staticCanvas.height = oh;
    this.staticCtx.imageSmoothingEnabled = false;
    this.staticCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (this.offsetX === 0 && this.offsetY === 0) {
      this.scale = Math.min(width / OFFICE_WIDTH, height / OFFICE_HEIGHT) * 0.9;
      this.offsetX = (width - OFFICE_WIDTH * this.scale) / 2;
      this.offsetY = (height - OFFICE_HEIGHT * this.scale) / 2;
    }

    // Force a background redraw on next frame
    this.lastBgRenderTime = 0;
    this.staticReady = false;
    this.dirty = true;
  }

  private update() {
    let anyMoving = false;
    for (const agent of this.agents.values()) {
      updateAgentPosition(agent);
      const dx = agent.targetX - agent.x;
      const dy = agent.targetY - agent.y;
      if (dx * dx + dy * dy > 4) anyMoving = true;
    }
    updateBubbles(this.bubbles);

    if (anyMoving) this.dirty = true;

    // Focus easing
    if (this.focusTarget) {
      const ease = 0.12;
      this.scale += (this.focusTarget.scale - this.scale) * ease;
      this.offsetX += (this.focusTarget.x - this.offsetX) * ease;
      this.offsetY += (this.focusTarget.y - this.offsetY) * ease;
      const done =
        Math.abs(this.focusTarget.scale - this.scale) < 0.01 &&
        Math.abs(this.focusTarget.x - this.offsetX) < 0.5 &&
        Math.abs(this.focusTarget.y - this.offsetY) < 0.5;
      if (done) {
        this.scale = this.focusTarget.scale;
        this.offsetX = this.focusTarget.x;
        this.offsetY = this.focusTarget.y;
        this.focusTarget = null;
      }
    }

    // Throttle background redraws: 50ms when active, 200ms when quiet
    this.bgThrottleMs = (anyMoving || this.bubbles.length > 0 || this.focusTarget !== null) ? 50 : 200;
  }

  private draw() {
    const { ctx, canvas } = this;
    const now = Date.now();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Base clear color that blends into the office background
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Throttled Background Rendering (Cache to Offscreen Canvas)
    // Static layer (drawn once)
    if (!this.staticReady) {
      this.staticCtx.clearRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);
      drawStaticBackground(this.staticCtx, this.labels);
      this.staticReady = true;
    }

    // Animated overlay (throttled)
    if (now - this.lastBgRenderTime > this.bgThrottleMs) {
      this.bgCtx.clearRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);
      this.bgCtx.drawImage(this.staticCanvas, 0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);
      drawAnimatedOverlay(this.bgCtx, this.labels, now);
      this.lastBgRenderTime = now;
    }

    // Draw the cached background
    ctx.drawImage(this.bgCanvas, 0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);

    // Calculate Frustum Culling Viewport
    // How much of the world is currently visible on the screen?
    const viewWorldMinX = -this.offsetX / this.scale;
    const viewWorldMinY = -this.offsetY / this.scale;
    const viewWorldMaxX = viewWorldMinX + canvas.width / this.scale / this.dpr;
    const viewWorldMaxY = viewWorldMinY + canvas.height / this.scale / this.dpr;

    // Sprite drawing bounds padding (agents are roughly 60x60 max with shadows/names)
    const renderPadding = 60;

    // Pre-index bubbles by agentId (max 1 per agent), reuse Map
    this.bubbleMap.clear();
    for (const b of this.bubbles) {
      this.bubbleMap.set(b.agentId, b);
    }

    // Reuse sorted array — populate then sort
    this.sortedAgents.length = 0;
    for (const agent of this.agents.values()) {
      this.sortedAgents.push(agent);
    }
    this.sortedAgents.sort((a, b) => a.y - b.y);

    for (const agent of this.sortedAgents) {
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
      drawLobster(ctx, agent.x, agent.y, agent.appearance, agent.status, now, agent.phaseOffset, spriteScale, isHovered);
      drawNameTag(ctx, agent.x, agent.y, agent.name, agent.points, spriteScale, this.scale, isHovered);

      const bubble = this.bubbleMap.get(agent.id);
      if (bubble) {
        drawBubble(ctx, agent.x, agent.y, bubble, spriteScale);
      }
    }

    ctx.restore();

    // HUD overlay
    const onlineCount = this.onlineCount;
    const totalCount = this.agents.size;
    const hudText = `${this.hudOnline} ${onlineCount} / ${totalCount}`;

    ctx.save();
    const hudFont = CANVAS_FONTS.hud;
    ctx.font = hudFont;

    // Measure text for pill width
    const pillWidth = cachedMeasureText(ctx, hudText, hudFont) + 24;
    const pillHeight = 28;
    const pillX = 16;
    const pillY = this.logicalHeight - pillHeight - 16;

    // HUD Pill Background
    ctx.fillStyle = HUD_BG;
    ctx.shadowColor = HUD_SHADOW;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 14);
    ctx.fill();
    ctx.shadowBlur = 0;

    // HUD Pill Border
    ctx.strokeStyle = HUD_BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    // HUD Text
    ctx.fillStyle = HUD_TEXT_COLOR;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(hudText, pillX + 12, pillY + pillHeight / 2);

    // Status Indicator Dot (Pulsing) — use globalAlpha to avoid template string
    ctx.fillStyle = HUD_DOT_HEX;
    const pulseFade = ((Math.sin(now / 300) + 1) / 2);
    const dotAlpha = 0.4 + pulseFade * 0.4;
    ctx.shadowColor = HUD_DOT_COLOR;
    ctx.globalAlpha = dotAlpha;
    ctx.shadowBlur = 4 + pulseFade * 4;
    ctx.beginPath();
    ctx.arc(pillX + pillWidth - 14, pillY + pillHeight / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    ctx.restore();
    ctx.restore(); // DPR scale
  }

  focusAgent(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    const targetScale = 2;
    this.focusTarget = {
      scale: targetScale,
      x: this.logicalWidth / 2 - agent.x * targetScale,
      y: this.logicalHeight / 2 - agent.y * targetScale,
    };
  }

  getAgentCount() {
    return this.agents.size;
  }

  getOnlineCount() {
    return this.onlineCount;
  }
}
