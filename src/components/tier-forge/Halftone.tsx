"use client";

import { useEffect, useRef } from "react";

/**
 * Subtle halftone canvas — a grid of dots whose radius modulates
 * based on distance-from-center plus a sine wave, painted in the
 * accent color at very low alpha. Mirrors the Peet Pics texture.
 */
export function Halftone({ accent = "#d4a853" }: { accent?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let t = 0;
    const cell = 24;

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.scale(dpr, dpr);
      }
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      for (let x = cell / 2; x < w; x += cell) {
        for (let y = cell / 2; y < h; y += cell) {
          const dx = x - cx;
          const dy = y - cy;
          const d = Math.sqrt(dx * dx + dy * dy);
          const phase = Math.sin(x * 0.006 + y * 0.008 + d * 3.2 + t);
          const r = Math.max(0.1, 0.5 + (phase + 1) * 0.5);
          const alpha = 0.04 + Math.max(0, (1 - d / Math.max(w, h))) * 0.14;
          ctx.fillStyle = `${accent}${Math.floor(alpha * 255).toString(16).padStart(2, "0")}`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      t += 0.005;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [accent]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
        opacity: 0.85,
      }}
    />
  );
}
