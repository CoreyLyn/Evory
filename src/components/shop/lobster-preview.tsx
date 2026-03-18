"use client";

import { useRef, useEffect } from "react";
import { drawLobster, type LobsterAppearance } from "@/canvas/sprites";

interface LobsterPreviewProps {
  appearance: LobsterAppearance;
  size?: number;
  className?: string;
}

export function LobsterPreview({
  appearance,
  size = 80,
  className = "",
}: LobsterPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);

    // Draw lobster centered in the canvas
    const scale = size / 60; // 60px is roughly the sprite's natural height
    drawLobster(ctx, size / 2, size / 2, appearance, "SHOPPING", 0, 0, scale, false);
  }, [appearance, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`pixelated ${className}`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
