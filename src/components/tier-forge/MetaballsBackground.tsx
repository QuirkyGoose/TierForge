"use client";

import { useEffect, useRef } from "react";

const CIRCLE_COUNT = 7;

/**
 * SVG-metaballs background — the signature Peet Pics visual.
 * Renders a small set of drifting circles inside an SVG with a "goo" filter,
 * filled with the 3-stop accent gradient of the current room color.
 */
export function MetaballsBackground({ accent = "#d4a853" }: { accent?: string }) {
  const rafRef = useRef<number | null>(null);
  const circlesRef = useRef<SVGCircleElement[]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stop1Ref = useRef<SVGStopElement | null>(null);
  const stop2Ref = useRef<SVGStopElement | null>(null);
  const stop3Ref = useRef<SVGStopElement | null>(null);

  // Circle state: position, velocity, radius, target radius (kept in ref so it survives re-renders)
  const dataRef = useRef(
    Array.from({ length: CIRCLE_COUNT }).map(() => ({
      x: 0, y: 0, vx: 0, vy: 0, r: 60, tr: 80,
    }))
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.setAttribute("width", `${w}`);
      svg.setAttribute("height", `${h}`);

      const circles = circlesRef.current;
      const data = dataRef.current;

      data.forEach((d, i) => {
        if (!d.x && !d.y) {
          d.x = Math.random() * w;
          d.y = Math.random() * h;
          d.vx = (Math.random() - 0.5) * 0.35;
          d.vy = (Math.random() - 0.5) * 0.35;
          d.r = 50 + Math.random() * 50;
          d.tr = d.r;
        }
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < -d.r) d.vx = Math.abs(d.vx);
        if (d.x > w + d.r) d.vx = -Math.abs(d.vx);
        if (d.y < -d.r) d.vy = Math.abs(d.vy);
        if (d.y > h + d.r) d.vy = -Math.abs(d.vy);

        if (Math.random() < 0.005) d.tr = 50 + Math.random() * 60;
        d.r += (d.tr - d.r) * 0.04;

        const c = circles[i];
        if (c) {
          c.setAttribute("cx", String(d.x));
          c.setAttribute("cy", String(d.y));
          c.setAttribute("r", String(d.r));
        }
      });

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Sync gradient stops to accent
  useEffect(() => {
    if (stop1Ref.current) stop1Ref.current.setAttribute("stop-color", accent);
    if (stop2Ref.current) stop2Ref.current.setAttribute("stop-color", "#a0522d");
    if (stop3Ref.current) stop3Ref.current.setAttribute("stop-color", "#b5707e");
  }, [accent]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        ref={svgRef}
        style={{ position: "absolute", inset: 0, mixBlendMode: "screen", opacity: 0.55 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="22" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
          <linearGradient id="metaball-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" ref={stop1Ref} stopColor={accent} />
            <stop offset="55%" ref={stop2Ref} stopColor="#a0522d" />
            <stop offset="100%" ref={stop3Ref} stopColor="#b5707e" />
          </linearGradient>
        </defs>
        <g filter="url(#goo)" fill="url(#metaball-grad)">
          {Array.from({ length: CIRCLE_COUNT }).map((_, i) => (
            <circle
              key={i}
              ref={(el) => {
                if (el) circlesRef.current[i] = el;
              }}
              cx={0}
              cy={0}
              r={60}
            />
          ))}
        </g>
      </svg>
      {/* Bottom fade overlay (like the reference site) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, #020203 0%, #020203 14%, rgba(2,2,3,0.55) 52%, transparent 100%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
