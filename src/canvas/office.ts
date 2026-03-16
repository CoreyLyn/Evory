import { CANVAS_FONTS } from "./theme";

export interface OfficeZone {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  borderColor: string;
  label: string;
  icon: string;
}

export interface CanvasLabels {
  zones: Record<string, string>;
  entrance: string;
  taskCols: [string, string, string];
}

const TILE_SIZE = 16;

export const OFFICE_WIDTH = 1200;
export const OFFICE_HEIGHT = 800;

// Zone decoration color constants
const NOTE_COLORS = ["rgba(250, 204, 21, 0.8)", "rgba(248, 113, 113, 0.8)", "rgba(74, 222, 128, 0.8)", "rgba(96, 165, 250, 0.8)"];
const BOOK_COLORS = ["rgba(239, 68, 68, 0.7)", "rgba(59, 130, 246, 0.7)", "rgba(16, 185, 129, 0.7)", "rgba(245, 158, 11, 0.7)", "rgba(139, 92, 246, 0.7)"];
const ITEM_COLORS = ["rgba(250, 204, 21, 0.7)", "rgba(244, 114, 182, 0.7)", "rgba(56, 189, 248, 0.7)"];
const COL_COLORS = ["rgba(250, 204, 21, 0.3)", "rgba(56, 189, 248, 0.3)", "rgba(74, 222, 128, 0.3)"];

export const DEFAULT_LABELS: CanvasLabels = {
  zones: {
    desks: "工作区",
    bulletin: "论坛公告板",
    bookshelf: "知识库",
    taskboard: "任务板",
    lounge: "休息区",
    shop: "商店",
  },
  entrance: "入口",
  taskCols: ["待办", "进行", "完成"],
};

export const ZONES: OfficeZone[] = [
  { name: "desks", x: 60, y: 60, w: 400, h: 280, color: "rgba(30, 41, 59, 0.4)", borderColor: "rgba(96, 165, 250, 0.3)", label: "工作区", icon: "💻" },
  { name: "bulletin", x: 520, y: 60, w: 300, h: 200, color: "rgba(63, 63, 70, 0.3)", borderColor: "rgba(161, 161, 170, 0.3)", label: "论坛公告板", icon: "📋" },
  { name: "bookshelf", x: 520, y: 320, w: 300, h: 200, color: "rgba(20, 83, 45, 0.3)", borderColor: "rgba(74, 222, 128, 0.3)", label: "知识库", icon: "📚" },
  { name: "taskboard", x: 880, y: 60, w: 260, h: 280, color: "rgba(49, 46, 129, 0.3)", borderColor: "rgba(129, 140, 248, 0.3)", label: "任务板", icon: "📌" },
  { name: "lounge", x: 60, y: 400, w: 400, h: 280, color: "rgba(88, 28, 135, 0.25)", borderColor: "rgba(192, 132, 252, 0.3)", label: "休息区", icon: "☕" },
  { name: "shop", x: 880, y: 400, w: 260, h: 280, color: "rgba(131, 24, 67, 0.25)", borderColor: "rgba(244, 114, 182, 0.3)", label: "商店", icon: "🛒" },
];

export function getZoneForStatus(status: string): OfficeZone {
  switch (status) {
    case "WORKING": return ZONES[0];
    case "POSTING": return ZONES[1];
    case "READING": return ZONES[2];
    case "ONLINE": return ZONES[3];
    case "IDLE": return ZONES[4];
    default: return ZONES[4];
  }
}

/** Draw once: gradient, grid, walls, entrance bar. Never changes. */
export function drawStaticBackground(ctx: CanvasRenderingContext2D, _labels: CanvasLabels = DEFAULT_LABELS) {
  // Background gradient
  const bgGradient = ctx.createRadialGradient(
    OFFICE_WIDTH / 2, OFFICE_HEIGHT / 2, 100,
    OFFICE_WIDTH / 2, OFFICE_HEIGHT / 2, OFFICE_WIDTH
  );
  bgGradient.addColorStop(0, "#0f172a");
  bgGradient.addColorStop(1, "#020617");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);

  // Grid
  ctx.strokeStyle = "rgba(148, 163, 184, 0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < OFFICE_WIDTH; x += TILE_SIZE) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, OFFICE_HEIGHT);
  }
  for (let y = 0; y < OFFICE_HEIGHT; y += TILE_SIZE) {
    ctx.moveTo(0, y);
    ctx.lineTo(OFFICE_WIDTH, y);
  }
  ctx.stroke();

  // Outer Walls
  ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, OFFICE_WIDTH - 4, OFFICE_HEIGHT - 4);

  // Door bar
  ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
  ctx.fillRect(OFFICE_WIDTH / 2 - 40, OFFICE_HEIGHT - 8, 80, 8);
}

/** Draw throttled: zone glows, decorations, animated elements. */
export function drawAnimatedOverlay(ctx: CanvasRenderingContext2D, labels: CanvasLabels = DEFAULT_LABELS, time: number = 0) {
  const breathe = (Math.sin(time / 1000) + 1) / 2;

  for (const zone of ZONES) {
    ctx.save();
    ctx.fillStyle = zone.color;
    ctx.shadowColor = zone.borderColor;
    ctx.shadowBlur = 10 + breathe * 10;
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = zone.borderColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
    drawZoneDetails(ctx, zone, labels, time);

    const zoneLabel = labels.zones[zone.name] ?? zone.label;
    const labelText = `${zone.icon} ${zoneLabel}`;
    ctx.font = CANVAS_FONTS.label;
    const labelWidth = Math.max(60, ctx.measureText(labelText).width + 24);
    ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
    ctx.beginPath();
    ctx.roundRect(zone.x + 12, zone.y + 12, labelWidth, 24, 6);
    ctx.fill();
    ctx.strokeStyle = zone.borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, zone.x + 20, zone.y + 24);
    ctx.restore();
  }

  // Door Glow (animated)
  ctx.shadowColor = `rgba(56, 189, 248, ${0.4 + breathe * 0.4})`;
  ctx.shadowBlur = 8 + breathe * 6;
  ctx.fillStyle = `rgba(56, 189, 248, ${0.7 + breathe * 0.3})`;
  ctx.font = CANVAS_FONTS.label;
  ctx.textAlign = "center";
  ctx.fillText(labels.entrance, OFFICE_WIDTH / 2, OFFICE_HEIGHT - 15);
  ctx.shadowBlur = 0;
}

/** @deprecated Use drawStaticBackground + drawAnimatedOverlay instead */
export function drawOffice(ctx: CanvasRenderingContext2D, labels: CanvasLabels = DEFAULT_LABELS, time: number = 0) {
  drawStaticBackground(ctx, labels);
  drawAnimatedOverlay(ctx, labels, time);
}

function drawZoneDetails(ctx: CanvasRenderingContext2D, zone: OfficeZone, labels: CanvasLabels, time: number = 0) {
  ctx.save();

  switch (zone.name) {
    case "desks": {
      ctx.fillStyle = "rgba(51, 65, 85, 0.4)"; // Desk base
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          const dx = zone.x + 40 + col * 85;
          const dy = zone.y + 60 + row * 75;

          // Desk
          ctx.beginPath();
          ctx.roundRect(dx, dy, 60, 35, 4);
          ctx.fill();

          // Monitor stand
          ctx.fillStyle = "rgba(71, 85, 105, 0.6)";
          ctx.fillRect(dx + 25, dy + 5, 10, 8);

          // Monitor screen (glowing dynamically)
          const screenGlow = (Math.sin(time / 800 + col + row) + 1) / 2;
          ctx.fillStyle = "rgba(30, 41, 59, 1)";
          ctx.shadowColor = `rgba(56, 189, 248, ${0.2 + screenGlow * 0.3})`;
          ctx.shadowBlur = 3 + screenGlow * 4;
          ctx.beginPath();
          ctx.roundRect(dx + 15, dy + 8, 30, 18, 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          // Screen content line
          ctx.fillStyle = `rgba(56, 189, 248, ${0.5 + screenGlow * 0.3})`;
          ctx.fillRect(dx + 18, dy + 12, 15, 2);

          ctx.fillStyle = "rgba(51, 65, 85, 0.4)"; // Reset for next desk
        }
      }
      break;
    }
    case "bulletin": {
      ctx.fillStyle = "rgba(63, 63, 70, 0.5)"; // Board background
      ctx.beginPath();
      ctx.roundRect(zone.x + 20, zone.y + 50, zone.w - 40, zone.h - 70, 4);
      ctx.fill();

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = NOTE_COLORS[i % NOTE_COLORS.length];
        const nx = zone.x + 40 + (i % 4) * 60;
        const ny = zone.y + 65 + Math.floor(i / 4) * 45;
        ctx.fillRect(nx, ny, 40, 30);
      }
      ctx.restore();

      // Pins (no shadow needed)
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      for (let i = 0; i < 9; i++) {
        const nx = zone.x + 40 + (i % 4) * 60;
        const ny = zone.y + 65 + Math.floor(i / 4) * 45;
        ctx.beginPath();
        ctx.arc(nx + 20, ny + 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "bookshelf": {
      for (let row = 0; row < 3; row++) {
        const sy = zone.y + 50 + row * 50;
        // Shelf plank
        ctx.fillStyle = "rgba(63, 62, 54, 0.8)";
        ctx.fillRect(zone.x + 20, sy + 35, zone.w - 40, 6);

        for (let b = 0; b < 10; b++) {
          ctx.fillStyle = BOOK_COLORS[(row * 7 + b) % BOOK_COLORS.length];
          // Slight random height/width for books
          const bw = 12 + (Math.sin(b * row) * 4);
          const bh = 25 + (Math.cos(b * row) * 5);
          ctx.fillRect(zone.x + 30 + b * 24, sy + 35 - bh, bw, bh);
        }
      }
      break;
    }
    case "taskboard": {
      ctx.fillStyle = "rgba(30, 27, 75, 0.4)";
      ctx.beginPath();
      ctx.roundRect(zone.x + 15, zone.y + 50, zone.w - 30, zone.h - 70, 6);
      ctx.fill();

      const cols = labels.taskCols;

      for (let c = 0; c < 3; c++) {
        const cx = zone.x + 20 + c * 75;

        // Column bg
        ctx.fillStyle = COL_COLORS[c];
        ctx.beginPath();
        ctx.roundRect(cx, zone.y + 60, 65, zone.h - 90, 4);
        ctx.fill();

        // Column header
        ctx.font = CANVAS_FONTS.small;
        ctx.fillStyle = "rgba(226, 232, 240, 0.8)";
        ctx.textAlign = "center";
        ctx.fillText(cols[c], cx + 32, zone.y + 75);

        // Cards
        for (let card = 0; card < 2 + (c % 2); card++) {
          ctx.save();
          ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
          ctx.shadowColor = "rgba(0,0,0,0.2)";
          ctx.shadowBlur = 3;
          ctx.shadowOffsetY = 1;
          ctx.beginPath();
          ctx.roundRect(cx + 8, zone.y + 85 + card * 30, 49, 22, 3);
          ctx.fill();
          ctx.restore();

          // Card content mock (no shadow)
          ctx.fillStyle = "rgba(100, 116, 139, 0.5)";
          ctx.fillRect(cx + 12, zone.y + 90 + card * 30, 30, 3);
          ctx.fillRect(cx + 12, zone.y + 95 + card * 30, 20, 3);
        }
      }
      break;
    }
    case "lounge": {
      // Rug
      ctx.fillStyle = "rgba(88, 28, 135, 0.2)";
      ctx.beginPath();
      ctx.ellipse(zone.x + 200, zone.y + 160, 100, 70, 0, 0, Math.PI * 2);
      ctx.fill();

      // Sofa
      ctx.fillStyle = "rgba(126, 34, 206, 0.5)";
      ctx.beginPath();
      ctx.roundRect(zone.x + 100, zone.y + 100, 120, 40, 10);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(zone.x + 90, zone.y + 110, 20, 40, 8); // Armrest left
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(zone.x + 210, zone.y + 110, 20, 40, 8); // Armrest right
      ctx.fill();

      // Coffee Table
      ctx.fillStyle = "rgba(63, 62, 54, 0.7)";
      ctx.beginPath();
      ctx.ellipse(zone.x + 160, zone.y + 180, 50, 25, 0, 0, Math.PI * 2);
      ctx.fill();

      // Plant
      ctx.fillStyle = "rgba(20, 83, 45, 0.8)";
      ctx.beginPath();
      ctx.arc(zone.x + 330, zone.y + 80, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(34, 197, 94, 0.5)";
      ctx.beginPath();
      ctx.arc(zone.x + 325, zone.y + 75, 15, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "shop": {
      for (let row = 0; row < 3; row++) {
        // Shelf
        ctx.fillStyle = "rgba(83, 25, 50, 0.5)";
        const sy = zone.y + 60 + row * 65;
        ctx.beginPath();
        ctx.roundRect(zone.x + 20, sy, zone.w - 40, 45, 6);
        ctx.fill();

        // Items
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = ITEM_COLORS[(row + i) % 3];

          ctx.shadowColor = ITEM_COLORS[(row + i) % 3];
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(zone.x + 50 + i * 80, sy + 22, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      break;
    }
  }

  ctx.restore();
}

export interface AgentPosition {
  id: string;
  name: string;
  status: string;
  points: number;
  appearance: { color: string; hat: string | null; accessory: string | null };
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  phaseOffset: number;  // Random offset so agents don't animate in sync
}

export function getRandomPositionInZone(zone: OfficeZone): { x: number; y: number } {
  const padding = 40;
  return {
    x: zone.x + padding + Math.random() * (zone.w - padding * 2),
    y: zone.y + padding + Math.random() * (zone.h - padding * 2),
  };
}

export function updateAgentPosition(agent: AgentPosition, easeFactor: number = 0.04): void {
  const dx = agent.targetX - agent.x;
  const dy = agent.targetY - agent.y;
  const distSq = dx * dx + dy * dy;

  if (distSq < 1.0) {
    agent.x = agent.targetX;
    agent.y = agent.targetY;
    if (Math.random() < 0.02) {
      const zone = getZoneForStatus(agent.status);
      const newPos = getRandomPositionInZone(zone);
      agent.targetX = newPos.x;
      agent.targetY = newPos.y;
    }
    return;
  }

  let vx = dx * easeFactor;
  let vy = dy * easeFactor;
  const speed = Math.sqrt(vx * vx + vy * vy);

  if (speed < 0.3) {
    const scale = 0.3 / speed;
    vx *= scale;
    vy *= scale;
  } else if (speed > 4.0) {
    const scale = 4.0 / speed;
    vx *= scale;
    vy *= scale;
  }

  agent.x += vx;
  agent.y += vy;
}
