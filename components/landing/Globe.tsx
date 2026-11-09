"use client";

import { useEffect, useRef } from "react";
import { LAND, SITES } from "./globe-data";

const ACCENT = "#3DDC84";
const REVIEW = "#F2A65A";

/** Slowly rotating dot globe centred on Indonesia, with pulsing plot markers. */
export default function Globe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      draw(canvas, (now - t0) / 1000);
      if (!reduce) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />;
}

function draw(c: HTMLCanvasElement, t: number) {
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const R = Math.min(w, h) * 0.47;
  const cx = w / 2;
  const cy = h / 2;
  const D = Math.PI / 180;
  const lon0 = (115 - t * 7) * D;
  const tilt = 12 * D;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const proj = (lat: number, lon: number): [number, number, number] => {
    const la = lat * D;
    const l = lon * D - lon0;
    const x = Math.cos(la) * Math.sin(l);
    const y = Math.sin(la);
    const z = Math.cos(la) * Math.cos(l);
    return [cx + x * R, cy - (y * ct - z * st) * R, y * st + z * ct];
  };

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.stroke();

  for (let i = 0; i < LAND.length; i += 2) {
    const [px, py, z] = proj(LAND[i] / 10, LAND[i + 1] / 10);
    if (z < 0) {
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = "#9AA59F";
      ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
    } else {
      ctx.globalAlpha = 0.18 + 0.72 * z;
      ctx.fillStyle = ACCENT;
      const s = 1 + 0.9 * z;
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    }
  }

  SITES.forEach(([lat, lon, review], i) => {
    const [px, py, z] = proj(lat, lon);
    if (z < 0.05) return;
    const col = review ? REVIEW : ACCENT;
    const ph = (t * 0.6 + i * 0.17) % 1;
    ctx.globalAlpha = (1 - ph) * 0.8 * z;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 4 + ph * 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = z;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}
