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
  // Row 1
  { name: "desks",     x: 40,  y: 40,  w: 360, h: 340, color: "rgba(30, 41, 59, 0.45)",  borderColor: "rgba(96, 165, 250, 0.35)",  label: "工作区",     icon: "💻" },
  { name: "bulletin",  x: 420, y: 40,  w: 360, h: 340, color: "rgba(63, 63, 70, 0.35)",  borderColor: "rgba(161, 161, 170, 0.35)", label: "论坛公告板", icon: "📋" },
  { name: "taskboard", x: 800, y: 40,  w: 360, h: 340, color: "rgba(49, 46, 129, 0.45)", borderColor: "rgba(129, 140, 248, 0.4)",  label: "任务板",     icon: "📌" },
  // Row 2
  { name: "lounge",    x: 40,  y: 400, w: 360, h: 340, color: "rgba(88, 28, 135, 0.35)", borderColor: "rgba(192, 132, 252, 0.35)", label: "休息区",     icon: "☕" },
  { name: "bookshelf", x: 420, y: 400, w: 360, h: 340, color: "rgba(20, 83, 45, 0.35)",  borderColor: "rgba(74, 222, 128, 0.35)",  label: "知识库",     icon: "📚" },
  { name: "shop",      x: 800, y: 400, w: 360, h: 340, color: "rgba(131, 24, 67, 0.4)",  borderColor: "rgba(244, 114, 182, 0.35)", label: "商店",       icon: "🛒" },
];

export function getZoneForStatus(status: string): OfficeZone {
  switch (status) {
    case "WORKING": return ZONES[0]; // desks
    case "POSTING": return ZONES[1]; // bulletin
    case "READING": return ZONES[4]; // bookshelf
    case "ONLINE":  return ZONES[2]; // taskboard
    case "IDLE":    return ZONES[3]; // lounge
    default:        return ZONES[3]; // lounge
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
  for (const zone of ZONES) {
    // Per-zone phase offset for independent breathing
    const phaseOffset = zone.x * 0.005 + zone.y * 0.003;
    const breathe = (Math.sin(time / 1200 + phaseOffset) + 1) / 2;

    ctx.save();

    // Zone background with inner gradient
    const grad = ctx.createLinearGradient(zone.x, zone.y, zone.x, zone.y + zone.h);
    grad.addColorStop(0, zone.color);
    grad.addColorStop(1, zone.color.replace(/[\d.]+\)$/, `${parseFloat(zone.color.match(/[\d.]+\)$/)?.[0] ?? '0.4') * 0.5})`) );
    ctx.fillStyle = grad;
    ctx.shadowColor = zone.borderColor;
    ctx.shadowBlur = 8 + breathe * 12;
    ctx.beginPath();
    ctx.roundRect(zone.x, zone.y, zone.w, zone.h, 8);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = zone.borderColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner highlight line (top edge glow)
    const hlGrad = ctx.createLinearGradient(zone.x + 20, zone.y, zone.x + zone.w - 20, zone.y);
    hlGrad.addColorStop(0, "rgba(255,255,255,0)");
    hlGrad.addColorStop(0.5, zone.borderColor.replace(/[\d.]+\)$/, `${0.2 + breathe * 0.15})`) );
    hlGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = hlGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(zone.x + 20, zone.y + 0.5);
    ctx.lineTo(zone.x + zone.w - 20, zone.y + 0.5);
    ctx.stroke();

    drawZoneDetails(ctx, zone, labels, time);

    // Zone label with gradient pill
    const zoneLabel = labels.zones[zone.name] ?? zone.label;
    const labelText = `${zone.icon} ${zoneLabel}`;
    ctx.font = CANVAS_FONTS.label;
    const labelWidth = Math.max(70, ctx.measureText(labelText).width + 28);
    const lblGrad = ctx.createLinearGradient(zone.x + 12, zone.y + 12, zone.x + 12 + labelWidth, zone.y + 12);
    lblGrad.addColorStop(0, "rgba(15, 23, 42, 0.9)");
    lblGrad.addColorStop(1, zone.color.replace(/[\d.]+\)$/, "0.6)"));
    ctx.fillStyle = lblGrad;
    ctx.beginPath();
    ctx.roundRect(zone.x + 12, zone.y + 12, labelWidth, 26, 8);
    ctx.fill();
    ctx.strokeStyle = zone.borderColor;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Label glow underline
    ctx.strokeStyle = zone.borderColor.replace(/[\d.]+\)$/, `${0.3 + breathe * 0.2})`);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(zone.x + 18, zone.y + 38);
    ctx.lineTo(zone.x + 12 + labelWidth - 6, zone.y + 38);
    ctx.stroke();

    ctx.fillStyle = "rgba(226, 232, 240, 0.95)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, zone.x + 22, zone.y + 25);
    ctx.restore();
  }

  // Entrance indicator with arch + arrow
  const entranceBreathe = (Math.sin(time / 800) + 1) / 2;
  ctx.save();

  // Arch shape
  ctx.strokeStyle = `rgba(56, 189, 248, ${0.3 + entranceBreathe * 0.3})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(OFFICE_WIDTH / 2, OFFICE_HEIGHT - 6, 30, Math.PI, 0);
  ctx.stroke();

  // Arch fill glow
  const archGrad = ctx.createRadialGradient(
    OFFICE_WIDTH / 2, OFFICE_HEIGHT - 6, 2,
    OFFICE_WIDTH / 2, OFFICE_HEIGHT - 6, 30
  );
  archGrad.addColorStop(0, `rgba(56, 189, 248, ${0.15 + entranceBreathe * 0.1})`);
  archGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
  ctx.fillStyle = archGrad;
  ctx.beginPath();
  ctx.arc(OFFICE_WIDTH / 2, OFFICE_HEIGHT - 6, 30, Math.PI, 0);
  ctx.lineTo(OFFICE_WIDTH / 2 + 30, OFFICE_HEIGHT);
  ctx.lineTo(OFFICE_WIDTH / 2 - 30, OFFICE_HEIGHT);
  ctx.fill();

  // Arrow pointing inward
  const arrowY = OFFICE_HEIGHT - 22 - entranceBreathe * 3;
  ctx.fillStyle = `rgba(56, 189, 248, ${0.6 + entranceBreathe * 0.3})`;
  ctx.beginPath();
  ctx.moveTo(OFFICE_WIDTH / 2, arrowY - 6);
  ctx.lineTo(OFFICE_WIDTH / 2 - 5, arrowY);
  ctx.lineTo(OFFICE_WIDTH / 2 + 5, arrowY);
  ctx.fill();

  // Entrance text
  ctx.shadowColor = `rgba(56, 189, 248, ${0.4 + entranceBreathe * 0.4})`;
  ctx.shadowBlur = 8 + entranceBreathe * 6;
  ctx.fillStyle = `rgba(56, 189, 248, ${0.8 + entranceBreathe * 0.2})`;
  ctx.font = CANVAS_FONTS.label;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(labels.entrance, OFFICE_WIDTH / 2, OFFICE_HEIGHT - 38);
  ctx.shadowBlur = 0;
  ctx.restore();
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
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          const dx = zone.x + 35 + col * 80;
          const dy = zone.y + 55 + row * 85;

          // Desk surface
          ctx.fillStyle = "rgba(51, 65, 85, 0.5)";
          ctx.beginPath();
          ctx.roundRect(dx, dy, 65, 38, 4);
          ctx.fill();
          // Desk edge highlight
          ctx.strokeStyle = "rgba(71, 85, 105, 0.4)";
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Monitor stand
          ctx.fillStyle = "rgba(71, 85, 105, 0.7)";
          ctx.fillRect(dx + 27, dy + 4, 10, 6);
          ctx.fillRect(dx + 24, dy + 10, 16, 2);

          // Monitor screen (glowing dynamically)
          const screenGlow = (Math.sin(time / 800 + col * 1.5 + row * 2.1) + 1) / 2;
          ctx.fillStyle = "rgba(15, 23, 42, 1)";
          ctx.shadowColor = `rgba(56, 189, 248, ${0.15 + screenGlow * 0.25})`;
          ctx.shadowBlur = 3 + screenGlow * 5;
          ctx.beginPath();
          ctx.roundRect(dx + 14, dy + 5, 36, 20, 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          // Screen content lines (code-like)
          const lineAlpha = 0.4 + screenGlow * 0.3;
          ctx.fillStyle = `rgba(56, 189, 248, ${lineAlpha})`;
          ctx.fillRect(dx + 17, dy + 9, 18, 1.5);
          ctx.fillStyle = `rgba(74, 222, 128, ${lineAlpha * 0.8})`;
          ctx.fillRect(dx + 17, dy + 13, 12, 1.5);
          ctx.fillStyle = `rgba(192, 132, 252, ${lineAlpha * 0.6})`;
          ctx.fillRect(dx + 17, dy + 17, 22, 1.5);

          // Keyboard
          ctx.fillStyle = "rgba(51, 65, 85, 0.8)";
          ctx.beginPath();
          ctx.roundRect(dx + 18, dy + 28, 28, 8, 2);
          ctx.fill();
          // Keyboard keys
          ctx.fillStyle = "rgba(71, 85, 105, 0.9)";
          for (let k = 0; k < 5; k++) {
            ctx.fillRect(dx + 20 + k * 5, dy + 30, 3, 2);
            ctx.fillRect(dx + 20 + k * 5, dy + 33, 3, 2);
          }
        }
      }
      break;
    }
    case "bulletin": {
      // Board background with wood frame
      ctx.fillStyle = "rgba(63, 63, 70, 0.5)";
      ctx.beginPath();
      ctx.roundRect(zone.x + 18, zone.y + 48, zone.w - 36, zone.h - 65, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(120, 113, 108, 0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Notes with slight rotation and shadow
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      const notePositions = [
        { x: 0, y: 0, r: -0.03 }, { x: 1, y: 0, r: 0.05 }, { x: 2, y: 0, r: -0.02 }, { x: 3, y: 0, r: 0.04 },
        { x: 0, y: 1, r: 0.03 }, { x: 1, y: 1, r: -0.04 }, { x: 2, y: 1, r: 0.02 }, { x: 3, y: 1, r: -0.05 },
        { x: 0, y: 2, r: 0.04 },
      ];
      for (let i = 0; i < notePositions.length; i++) {
        const np = notePositions[i];
        ctx.save();
        const nx = zone.x + 38 + np.x * 62;
        const ny = zone.y + 63 + np.y * 48;
        ctx.translate(nx + 20, ny + 15);
        ctx.rotate(np.r);
        ctx.fillStyle = NOTE_COLORS[i % NOTE_COLORS.length];
        ctx.fillRect(-20, -15, 42, 32);
        // Note text lines
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.fillRect(-14, -5, 26, 2);
        ctx.fillRect(-14, 1, 18, 2);
        ctx.fillRect(-14, 7, 22, 2);
        ctx.restore();
      }
      ctx.restore();

      // Pins with metallic look
      for (let i = 0; i < notePositions.length; i++) {
        const np = notePositions[i];
        const nx = zone.x + 38 + np.x * 62;
        const ny = zone.y + 63 + np.y * 48;
        // Pin shadow
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.arc(nx + 20, ny + 5, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Pin head
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.beginPath();
        ctx.arc(nx + 20, ny + 4, 2, 0, Math.PI * 2);
        ctx.fill();
        // Pin highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.beginPath();
        ctx.arc(nx + 19.5, ny + 3.5, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "bookshelf": {
      for (let row = 0; row < 3; row++) {
        const sy = zone.y + 50 + row * 52;

        // Shelf plank with 3D effect
        ctx.fillStyle = "rgba(87, 83, 72, 0.7)";
        ctx.fillRect(zone.x + 18, sy + 36, zone.w - 36, 6);
        ctx.fillStyle = "rgba(63, 62, 54, 0.5)";
        ctx.fillRect(zone.x + 18, sy + 42, zone.w - 36, 3); // shelf depth

        // Bracket supports
        ctx.fillStyle = "rgba(87, 83, 72, 0.6)";
        ctx.fillRect(zone.x + 30, sy + 36, 3, 8);
        ctx.fillRect(zone.x + zone.w - 33, sy + 36, 3, 8);

        for (let b = 0; b < 10; b++) {
          const bookColor = BOOK_COLORS[(row * 7 + b) % BOOK_COLORS.length];
          ctx.fillStyle = bookColor;
          // Variable height/width for natural look
          const bw = 12 + (Math.sin(b * row * 1.7) * 4);
          const bh = 26 + (Math.cos(b * row * 1.3) * 6);
          const bx = zone.x + 28 + b * 24;
          ctx.fillRect(bx, sy + 36 - bh, bw, bh);
          // Spine highlight
          ctx.fillStyle = bookColor.replace(/[\d.]+\)$/, "0.3)");
          ctx.fillRect(bx + 1, sy + 36 - bh + 2, 2, bh - 4);
          // Spine line
          ctx.fillStyle = "rgba(255,255,255,0.1)";
          ctx.fillRect(bx + bw / 2 - 0.5, sy + 36 - bh + 6, 1, bh - 12);
        }
      }

      // Globe/Reading lamp accent
      ctx.fillStyle = "rgba(234, 179, 8, 0.3)";
      ctx.beginPath();
      ctx.arc(zone.x + zone.w - 45, zone.y + 55, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(234, 179, 8, 0.5)";
      ctx.beginPath();
      ctx.arc(zone.x + zone.w - 45, zone.y + 55, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "taskboard": {
      ctx.fillStyle = "rgba(30, 27, 75, 0.45)";
      ctx.beginPath();
      ctx.roundRect(zone.x + 15, zone.y + 48, zone.w - 30, zone.h - 65, 6);
      ctx.fill();

      const cols = labels.taskCols;
      const colWidth = (zone.w - 50) / 3;
      const PRIORITY_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"];

      for (let c = 0; c < 3; c++) {
        const cx = zone.x + 20 + c * (colWidth + 5);

        // Column bg
        ctx.fillStyle = COL_COLORS[c];
        ctx.beginPath();
        ctx.roundRect(cx, zone.y + 58, colWidth, zone.h - 85, 5);
        ctx.fill();

        // Column header
        ctx.font = CANVAS_FONTS.small;
        ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
        ctx.textAlign = "center";
        ctx.fillText(cols[c], cx + colWidth / 2, zone.y + 73);

        // Divider line under header
        ctx.strokeStyle = "rgba(226, 232, 240, 0.15)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(cx + 6, zone.y + 80);
        ctx.lineTo(cx + colWidth - 6, zone.y + 80);
        ctx.stroke();

        // Cards
        const cardCount = c === 0 ? 3 : c === 1 ? 2 : 2;
        for (let card = 0; card < cardCount; card++) {
          ctx.save();
          ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
          ctx.shadowColor = "rgba(0,0,0,0.15)";
          ctx.shadowBlur = 3;
          ctx.shadowOffsetY = 1;
          const cardY = zone.y + 86 + card * 34;
          ctx.beginPath();
          ctx.roundRect(cx + 6, cardY, colWidth - 12, 28, 4);
          ctx.fill();
          ctx.restore();

          // Priority color strip
          const prioColor = PRIORITY_COLORS[(card + c) % PRIORITY_COLORS.length];
          ctx.fillStyle = prioColor;
          ctx.beginPath();
          ctx.roundRect(cx + 6, cardY, 3, 28, [4, 0, 0, 4]);
          ctx.fill();

          // Card content lines
          ctx.fillStyle = "rgba(71, 85, 105, 0.6)";
          ctx.fillRect(cx + 14, cardY + 8, colWidth * 0.5, 3);
          ctx.fillStyle = "rgba(100, 116, 139, 0.35)";
          ctx.fillRect(cx + 14, cardY + 15, colWidth * 0.35, 3);
        }
      }
      break;
    }
    case "lounge": {
      // Rug with pattern
      ctx.fillStyle = "rgba(88, 28, 135, 0.2)";
      ctx.beginPath();
      ctx.ellipse(zone.x + 190, zone.y + 160, 110, 70, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(192, 132, 252, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(zone.x + 190, zone.y + 160, 80, 50, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(zone.x + 190, zone.y + 160, 50, 30, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Sofa with cushions
      ctx.fillStyle = "rgba(126, 34, 206, 0.55)";
      ctx.beginPath();
      ctx.roundRect(zone.x + 100, zone.y + 95, 130, 45, 10);
      ctx.fill();
      // Cushion lines
      ctx.strokeStyle = "rgba(88, 28, 135, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(zone.x + 145, zone.y + 100);
      ctx.lineTo(zone.x + 145, zone.y + 135);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(zone.x + 190, zone.y + 100);
      ctx.lineTo(zone.x + 190, zone.y + 135);
      ctx.stroke();

      // Armrests
      ctx.fillStyle = "rgba(126, 34, 206, 0.6)";
      ctx.beginPath();
      ctx.roundRect(zone.x + 88, zone.y + 105, 18, 42, 8);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(zone.x + 224, zone.y + 105, 18, 42, 8);
      ctx.fill();

      // Coffee Table
      ctx.fillStyle = "rgba(87, 83, 72, 0.7)";
      ctx.beginPath();
      ctx.ellipse(zone.x + 165, zone.y + 180, 45, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(120, 113, 108, 0.3)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Coffee cup on table
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.beginPath();
      ctx.roundRect(zone.x + 155, zone.y + 174, 8, 10, 2);
      ctx.fill();
      // Cup handle
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(zone.x + 164, zone.y + 179, 3, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      // Steam
      const steamPhase = Math.sin(time / 400) * 2;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 + Math.sin(time / 600) * 0.1})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(zone.x + 158, zone.y + 172);
      ctx.quadraticCurveTo(zone.x + 156 + steamPhase, zone.y + 166, zone.x + 159, zone.y + 160);
      ctx.stroke();

      // Magazine on table
      ctx.fillStyle = "rgba(59, 130, 246, 0.4)";
      ctx.save();
      ctx.translate(zone.x + 175, zone.y + 180);
      ctx.rotate(0.2);
      ctx.fillRect(-6, -4, 12, 8);
      ctx.restore();

      // Plant with pot
      ctx.fillStyle = "rgba(120, 80, 50, 0.6)";
      ctx.beginPath();
      ctx.roundRect(zone.x + 318, zone.y + 95, 30, 22, [0, 0, 4, 4]);
      ctx.fill();
      // Pot rim
      ctx.fillStyle = "rgba(140, 100, 70, 0.5)";
      ctx.fillRect(zone.x + 315, zone.y + 93, 36, 4);
      // Plant leaves
      ctx.fillStyle = "rgba(20, 83, 45, 0.8)";
      ctx.beginPath();
      ctx.arc(zone.x + 333, zone.y + 80, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(34, 197, 94, 0.5)";
      ctx.beginPath();
      ctx.arc(zone.x + 327, zone.y + 74, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(74, 222, 128, 0.3)";
      ctx.beginPath();
      ctx.arc(zone.x + 340, zone.y + 77, 10, 0, Math.PI * 2);
      ctx.fill();

      // Ceiling lamp glow
      const lampGlow = (Math.sin(time / 2000) + 1) / 2;
      ctx.fillStyle = `rgba(234, 179, 8, ${0.08 + lampGlow * 0.04})`;
      ctx.beginPath();
      ctx.ellipse(zone.x + 165, zone.y + 120, 60, 40, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "shop": {
      for (let row = 0; row < 3; row++) {
        const sy = zone.y + 58 + row * 68;

        // Shelf with glass look
        ctx.fillStyle = "rgba(83, 25, 50, 0.4)";
        ctx.beginPath();
        ctx.roundRect(zone.x + 18, sy, zone.w - 36, 50, 6);
        ctx.fill();
        ctx.strokeStyle = "rgba(244, 114, 182, 0.15)";
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Items as capsule/box shapes with labels
        const itemCount = 4;
        const spacing = (zone.w - 60) / itemCount;
        for (let i = 0; i < itemCount; i++) {
          const itemColor = ITEM_COLORS[(row + i) % ITEM_COLORS.length];
          const ix = zone.x + 36 + i * spacing;

          // Item glow
          ctx.shadowColor = itemColor;
          ctx.shadowBlur = 6;

          // Alternate between shapes
          if ((row + i) % 3 === 0) {
            // Capsule shape
            ctx.fillStyle = itemColor;
            ctx.beginPath();
            ctx.roundRect(ix - 10, sy + 10, 20, 28, 10);
            ctx.fill();
          } else if ((row + i) % 3 === 1) {
            // Box shape
            ctx.fillStyle = itemColor;
            ctx.beginPath();
            ctx.roundRect(ix - 10, sy + 14, 22, 22, 4);
            ctx.fill();
            // Box ribbon
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fillRect(ix - 1, sy + 14, 2, 22);
            ctx.fillRect(ix - 10, sy + 24, 22, 2);
          } else {
            // Star/gem shape
            ctx.fillStyle = itemColor;
            ctx.beginPath();
            ctx.moveTo(ix, sy + 12);
            ctx.lineTo(ix + 10, sy + 22);
            ctx.lineTo(ix + 6, sy + 35);
            ctx.lineTo(ix - 6, sy + 35);
            ctx.lineTo(ix - 10, sy + 22);
            ctx.closePath();
            ctx.fill();
          }
          ctx.shadowBlur = 0;

          // Price tag
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.font = "7px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(`${(row * itemCount + i + 1) * 10}`, ix, sy + 46);
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
