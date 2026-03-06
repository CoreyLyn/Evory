export interface SpriteFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LobsterAppearance {
  color: string;
  hat: string | null;
  accessory: string | null;
}

const LOBSTER_COLORS: Record<string, string> = {
  red: "#ff4444",
  orange: "#ff8844",
  blue: "#4488ff",
  green: "#44cc44",
  purple: "#aa44ff",
  pink: "#ff44aa",
  gold: "#ffcc00",
  cyan: "#00cccc",
  white: "#eeeeff",
};

const HAT_SPRITES: Record<string, (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => void> = {
  crown: (ctx, x, y, s) => {
    ctx.fillStyle = "#ffcc00";
    ctx.fillRect(x - 5 * s, y - 8 * s, 10 * s, 5 * s);
    ctx.fillRect(x - 5 * s, y - 11 * s, 2 * s, 3 * s);
    ctx.fillRect(x - 1 * s, y - 12 * s, 2 * s, 4 * s);
    ctx.fillRect(x + 3 * s, y - 11 * s, 2 * s, 3 * s);
  },
  tophat: (ctx, x, y, s) => {
    ctx.fillStyle = "#222233";
    ctx.fillRect(x - 6 * s, y - 8 * s, 12 * s, 2 * s);
    ctx.fillRect(x - 4 * s, y - 16 * s, 8 * s, 8 * s);
  },
  party: (ctx, x, y, s) => {
    ctx.fillStyle = "#ff44aa";
    ctx.beginPath();
    ctx.moveTo(x, y - 16 * s);
    ctx.lineTo(x - 5 * s, y - 6 * s);
    ctx.lineTo(x + 5 * s, y - 6 * s);
    ctx.fill();
    ctx.fillStyle = "#ffcc00";
    ctx.fillRect(x - 1 * s, y - 18 * s, 2 * s, 3 * s);
  },
  chef: (ctx, x, y, s) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - 5 * s, y - 8 * s, 10 * s, 3 * s);
    ctx.fillRect(x - 4 * s, y - 14 * s, 8 * s, 6 * s);
    ctx.beginPath();
    ctx.arc(x, y - 14 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
  },
};

const ACCESSORY_SPRITES: Record<string, (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => void> = {
  glasses: (ctx, x, y, s) => {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = s;
    ctx.strokeRect(x - 5 * s, y - 2 * s, 4 * s, 3 * s);
    ctx.strokeRect(x + 1 * s, y - 2 * s, 4 * s, 3 * s);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - 1 * s, y - 1 * s, 2 * s, s);
  },
  monocle: (ctx, x, y, s) => {
    ctx.strokeStyle = "#ffcc00";
    ctx.lineWidth = s;
    ctx.beginPath();
    ctx.arc(x + 3 * s, y, 3 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 6 * s, y + 2 * s);
    ctx.lineTo(x + 8 * s, y + 8 * s);
    ctx.stroke();
  },
  bowtie: (ctx, x, y, s) => {
    ctx.fillStyle = "#ff4444";
    ctx.beginPath();
    ctx.moveTo(x, y + 5 * s);
    ctx.lineTo(x - 4 * s, y + 2 * s);
    ctx.lineTo(x - 4 * s, y + 8 * s);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y + 5 * s);
    ctx.lineTo(x + 4 * s, y + 2 * s);
    ctx.lineTo(x + 4 * s, y + 8 * s);
    ctx.fill();
  },
};

export function drawLobster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  appearance: LobsterAppearance,
  status: string,
  frame: number,
  scale: number = 2
) {
  const s = scale;
  const color = LOBSTER_COLORS[appearance.color] || LOBSTER_COLORS.red;
  const alpha = status === "OFFLINE" ? 0.3 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  const bodyColor = color;
  const darkColor = darkenColor(color, 0.3);
  const lightColor = lightenColor(color, 0.3);

  const bobOffset = Math.sin(frame * 0.08) * 1.5 * s;

  const drawY = y + bobOffset;

  // Tail
  ctx.fillStyle = darkColor;
  ctx.fillRect(x - 2 * s, drawY + 8 * s, 4 * s, 6 * s);
  ctx.fillRect(x - 4 * s, drawY + 14 * s, 8 * s, 2 * s);

  // Body
  ctx.fillStyle = bodyColor;
  ctx.fillRect(x - 5 * s, drawY - 4 * s, 10 * s, 12 * s);

  // Head
  ctx.fillStyle = bodyColor;
  ctx.fillRect(x - 6 * s, drawY - 6 * s, 12 * s, 6 * s);

  // Eyes
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 4 * s, drawY - 5 * s, 3 * s, 3 * s);
  ctx.fillRect(x + 1 * s, drawY - 5 * s, 3 * s, 3 * s);
  ctx.fillStyle = "#111111";
  const eyePhase = Math.floor(frame / 30) % 4;
  const eyeOffX = eyePhase === 1 ? s : eyePhase === 3 ? -s : 0;
  ctx.fillRect(x - 3 * s + eyeOffX, drawY - 4 * s, 1.5 * s, 1.5 * s);
  ctx.fillRect(x + 2 * s + eyeOffX, drawY - 4 * s, 1.5 * s, 1.5 * s);

  // Claws
  const clawAngle = Math.sin(frame * 0.06) * 0.15;
  ctx.fillStyle = lightColor;
  // Left claw
  ctx.save();
  ctx.translate(x - 6 * s, drawY);
  ctx.rotate(-0.3 + clawAngle);
  ctx.fillRect(-8 * s, -2 * s, 8 * s, 3 * s);
  ctx.fillRect(-10 * s, -4 * s, 4 * s, 3 * s);
  ctx.fillRect(-10 * s, 1 * s, 4 * s, 3 * s);
  ctx.restore();
  // Right claw
  ctx.save();
  ctx.translate(x + 6 * s, drawY);
  ctx.rotate(0.3 - clawAngle);
  ctx.fillRect(0, -2 * s, 8 * s, 3 * s);
  ctx.fillRect(6 * s, -4 * s, 4 * s, 3 * s);
  ctx.fillRect(6 * s, 1 * s, 4 * s, 3 * s);
  ctx.restore();

  // Legs (4 pairs)
  ctx.fillStyle = darkColor;
  for (let i = 0; i < 4; i++) {
    const legY = drawY + i * 2.5 * s;
    const legWiggle = Math.sin(frame * 0.1 + i * 0.8) * s;
    ctx.fillRect(x - 7 * s + legWiggle, legY, 2 * s, s);
    ctx.fillRect(x + 5 * s - legWiggle, legY, 2 * s, s);
  }

  // Antennae
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = s * 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 3 * s, drawY - 6 * s);
  ctx.quadraticCurveTo(
    x - 6 * s + Math.sin(frame * 0.05) * 2 * s,
    drawY - 14 * s,
    x - 4 * s + Math.sin(frame * 0.07) * 3 * s,
    drawY - 16 * s
  );
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 3 * s, drawY - 6 * s);
  ctx.quadraticCurveTo(
    x + 6 * s + Math.sin(frame * 0.05 + 1) * 2 * s,
    drawY - 14 * s,
    x + 4 * s + Math.sin(frame * 0.07 + 1) * 3 * s,
    drawY - 16 * s
  );
  ctx.stroke();

  // Status glow effect
  if (status === "WORKING") {
    ctx.shadowColor = "#ffcc00";
    ctx.shadowBlur = 10 * s;
    ctx.fillStyle = "rgba(255, 204, 0, 0.1)";
    ctx.fillRect(x - 8 * s, drawY - 8 * s, 16 * s, 24 * s);
    ctx.shadowBlur = 0;
  } else if (status === "POSTING") {
    ctx.shadowColor = "#4488ff";
    ctx.shadowBlur = 8 * s;
    ctx.fillStyle = "rgba(68, 136, 255, 0.1)";
    ctx.fillRect(x - 8 * s, drawY - 8 * s, 16 * s, 24 * s);
    ctx.shadowBlur = 0;
  }

  // Hat
  if (appearance.hat && HAT_SPRITES[appearance.hat]) {
    HAT_SPRITES[appearance.hat](ctx, x, drawY - 6 * s, s);
  }

  // Accessory
  if (appearance.accessory && ACCESSORY_SPRITES[appearance.accessory]) {
    ACCESSORY_SPRITES[appearance.accessory](ctx, x, drawY - 2 * s, s);
  }

  ctx.restore();
}

export function drawNameTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  points: number,
  scale: number = 2
) {
  const s = scale;
  ctx.save();

  ctx.font = `${8 * s}px monospace`;
  ctx.textAlign = "center";

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  const textWidth = ctx.measureText(name).width;
  ctx.fillRect(x - textWidth / 2 - 4 * s, y + 18 * s, textWidth + 8 * s, 12 * s);

  ctx.fillStyle = "#e0e0ff";
  ctx.fillText(name, x, y + 27 * s);

  ctx.font = `${6 * s}px monospace`;
  ctx.fillStyle = "#ffcc00";
  ctx.fillText(`${points}pts`, x, y + 36 * s);

  ctx.restore();
}

function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.floor(r * (1 - amount))}, ${Math.floor(g * (1 - amount))}, ${Math.floor(b * (1 - amount))})`;
}

function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, Math.floor(r + (255 - r) * amount))}, ${Math.min(255, Math.floor(g + (255 - g) * amount))}, ${Math.min(255, Math.floor(b + (255 - b) * amount))})`;
}
