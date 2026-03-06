export interface OfficeZone {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
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
  { name: "desks", x: 60, y: 60, w: 400, h: 280, color: "#1a1a3e", label: "工作区", icon: "💻" },
  { name: "bulletin", x: 520, y: 60, w: 300, h: 200, color: "#2a1a1a", label: "论坛公告板", icon: "📋" },
  { name: "bookshelf", x: 520, y: 320, w: 300, h: 200, color: "#1a2a1a", label: "知识库", icon: "📚" },
  { name: "taskboard", x: 880, y: 60, w: 260, h: 280, color: "#2a2a1a", label: "任务板", icon: "📌" },
  { name: "lounge", x: 60, y: 400, w: 400, h: 280, color: "#1a1a2a", label: "休息区", icon: "☕" },
  { name: "shop", x: 880, y: 400, w: 260, h: 280, color: "#2a1a2a", label: "商店", icon: "🛒" },
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

export function drawOffice(ctx: CanvasRenderingContext2D, labels: CanvasLabels = DEFAULT_LABELS) {
  // Floor
  ctx.fillStyle = "#0d0d20";
  ctx.fillRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);

  // Grid pattern
  ctx.strokeStyle = "rgba(40, 40, 80, 0.3)";
  ctx.lineWidth = 0.5;
  for (let x = 0; x < OFFICE_WIDTH; x += TILE_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, OFFICE_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < OFFICE_HEIGHT; y += TILE_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(OFFICE_WIDTH, y);
    ctx.stroke();
  }

  // Zones
  for (const zone of ZONES) {
    ctx.fillStyle = zone.color;
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

    ctx.strokeStyle = "rgba(100, 100, 160, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

    drawZoneDetails(ctx, zone, labels);

    // Zone label
    const zoneLabel = labels.zones[zone.name] ?? zone.label;
    ctx.save();
    ctx.font = "11px monospace";
    ctx.fillStyle = "rgba(150, 150, 200, 0.6)";
    ctx.textAlign = "left";
    ctx.fillText(`${zone.icon} ${zoneLabel}`, zone.x + 8, zone.y + 16);
    ctx.restore();
  }

  // Walls
  ctx.strokeStyle = "#3a3a6e";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, OFFICE_WIDTH - 4, OFFICE_HEIGHT - 4);

  // Door
  ctx.fillStyle = "#2a2a5e";
  ctx.fillRect(OFFICE_WIDTH / 2 - 25, OFFICE_HEIGHT - 4, 50, 6);
  ctx.fillStyle = "#4a4a8e";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText(labels.entrance, OFFICE_WIDTH / 2, OFFICE_HEIGHT - 8);
}

function drawZoneDetails(ctx: CanvasRenderingContext2D, zone: OfficeZone, labels: CanvasLabels) {
  ctx.save();

  switch (zone.name) {
    case "desks": {
      ctx.fillStyle = "#2a2a4e";
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          const dx = zone.x + 30 + col * 90;
          const dy = zone.y + 50 + row * 80;
          ctx.fillRect(dx, dy, 60, 30);
          ctx.fillStyle = "#333355";
          ctx.fillRect(dx + 20, dy + 2, 20, 14);
          ctx.fillStyle = "#1a3a2a";
          ctx.fillRect(dx + 22, dy + 4, 16, 10);
          ctx.fillStyle = "#2a2a4e";
        }
      }
      break;
    }
    case "bulletin": {
      ctx.fillStyle = "#3a2a1a";
      ctx.fillRect(zone.x + 20, zone.y + 30, zone.w - 40, zone.h - 50);
      const noteColors = ["#ffcc44", "#ff8844", "#44cc88", "#4488ff", "#ff44aa"];
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = noteColors[i % noteColors.length] + "88";
        const nx = zone.x + 30 + (i % 4) * 65;
        const ny = zone.y + 40 + Math.floor(i / 4) * 60;
        ctx.fillRect(nx, ny, 50, 45);
      }
      break;
    }
    case "bookshelf": {
      for (let row = 0; row < 3; row++) {
        ctx.fillStyle = "#3a2a1a";
        const sy = zone.y + 30 + row * 55;
        ctx.fillRect(zone.x + 20, sy, zone.w - 40, 40);
        const bookColors = ["#cc4444", "#4444cc", "#44cc44", "#cccc44", "#cc44cc", "#44cccc"];
        for (let b = 0; b < 12; b++) {
          ctx.fillStyle = bookColors[b % bookColors.length] + "aa";
          ctx.fillRect(zone.x + 25 + b * 20, sy + 5, 14, 30);
        }
      }
      break;
    }
    case "taskboard": {
      ctx.fillStyle = "#2a2a3e";
      ctx.fillRect(zone.x + 15, zone.y + 30, zone.w - 30, zone.h - 50);
      const cols = labels.taskCols;
      for (let c = 0; c < 3; c++) {
        const cx = zone.x + 20 + c * 78;
        ctx.fillStyle = "rgba(100, 100, 160, 0.3)";
        ctx.fillRect(cx, zone.y + 35, 70, zone.h - 65);
        ctx.font = "8px monospace";
        ctx.fillStyle = "rgba(150, 150, 200, 0.7)";
        ctx.textAlign = "center";
        ctx.fillText(cols[c], cx + 35, zone.y + 47);
        for (let card = 0; card < 3; card++) {
          ctx.fillStyle = "rgba(60, 60, 100, 0.6)";
          ctx.fillRect(cx + 5, zone.y + 55 + card * 32, 60, 24);
        }
      }
      break;
    }
    case "lounge": {
      ctx.fillStyle = "#3a2a4a";
      ctx.fillRect(zone.x + 40, zone.y + 80, 120, 50);
      ctx.fillRect(zone.x + 35, zone.y + 75, 10, 60);
      ctx.fillRect(zone.x + 155, zone.y + 75, 10, 60);
      ctx.fillStyle = "#3a3a2a";
      ctx.fillRect(zone.x + 60, zone.y + 150, 80, 40);
      ctx.fillStyle = "#2a5a2a";
      ctx.fillRect(zone.x + 300, zone.y + 60, 20, 30);
      ctx.fillStyle = "#1a3a1a";
      ctx.beginPath();
      ctx.arc(zone.x + 310, zone.y + 55, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(100, 50, 50, 0.2)";
      ctx.beginPath();
      ctx.ellipse(zone.x + 200, zone.y + 180, 80, 50, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "shop": {
      for (let row = 0; row < 3; row++) {
        ctx.fillStyle = "#3a2a3a";
        const sy = zone.y + 35 + row * 70;
        ctx.fillRect(zone.x + 15, sy, zone.w - 30, 50);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = ["#ffcc00", "#ff44aa", "#44ccff"][i] + "66";
          ctx.fillRect(zone.x + 25 + i * 75, sy + 10, 50, 30);
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
  frame: number;
}

export function getRandomPositionInZone(zone: OfficeZone): { x: number; y: number } {
  const padding = 40;
  return {
    x: zone.x + padding + Math.random() * (zone.w - padding * 2),
    y: zone.y + padding + Math.random() * (zone.h - padding * 2),
  };
}

export function updateAgentPosition(agent: AgentPosition, speed: number = 0.03): AgentPosition {
  const dx = agent.targetX - agent.x;
  const dy = agent.targetY - agent.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 2) {
    if (Math.random() < 0.01) {
      const zone = getZoneForStatus(agent.status);
      const newPos = getRandomPositionInZone(zone);
      return {
        ...agent,
        targetX: newPos.x,
        targetY: newPos.y,
        frame: agent.frame + 1,
      };
    }
    return { ...agent, frame: agent.frame + 1 };
  }

  return {
    ...agent,
    x: agent.x + dx * speed,
    y: agent.y + dy * speed,
    frame: agent.frame + 1,
  };
}
