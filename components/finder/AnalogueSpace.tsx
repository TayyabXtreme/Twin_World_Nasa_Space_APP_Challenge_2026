"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TypeInfo {
  id: number;
  name: string;
  blurb: string;
  color: string;
  areaPct: number;
}
interface TargetPoint {
  id: string;
  name: string;
  world: "moon" | "mars";
  pc: [number, number];
  type: number;
}
interface Points {
  data: [number, number, number, number, number][];
}
interface Clusters {
  types: TypeInfo[];
  targets: TargetPoint[];
}

const BASE = "/data/ml/analogue-space";
let cache: Promise<[Points, Clusters]> | null = null;
const load = () =>
  (cache ??= Promise.all([
    fetch(`${BASE}/points.json`).then((r) => r.json()),
    fetch(`${BASE}/clusters.json`).then((r) => r.json()),
  ]));

/**
 * Analogue Space (model M1): every Earth land cell placed by PCA on its measured environment, coloured by k-means
 * type; Moon and Mars targets are stars in the same chart. Click an Earth dot to fly the map there, a star to
 * score for that target.
 */
export function AnalogueSpace({
  currentId,
  onEarth,
  onTarget,
}: {
  currentId: string;
  onEarth: (lat: number, lon: number) => void;
  onTarget: (id: string) => void;
}) {
  const [data, setData] = useState<[Points, Clusters] | null>(null);
  const [type, setType] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 640, h: 440 });

  useEffect(() => {
    load().then(setData, () => {});
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: el.clientWidth, h: Math.min(520, Math.max(320, el.clientWidth * 0.66)) }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const xs = [...data[0].data.map((d) => d[0]), ...data[1].targets.map((t) => t.pc[0])];
    const ys = [...data[0].data.map((d) => d[1]), ...data[1].targets.map((t) => t.pc[1])];
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 28;
    const sx = (x: number) => pad + ((x - x0) / (x1 - x0)) * (size.w - 2 * pad);
    const sy = (y: number) => size.h - pad - ((y - y0) / (y1 - y0)) * (size.h - 2 * pad);
    return { sx, sy };
  }, [data, size]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !data || !view) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, size.w, size.h);
    const colors = data[1].types.map((t) => t.color);
    for (const [x, y, t] of data[0].data) {
      g.globalAlpha = type === null || type === t ? 0.8 : 0.08;
      g.fillStyle = colors[t];
      g.fillRect(view.sx(x) - 1.5, view.sy(y) - 1.5, 3, 3);
    }
    g.globalAlpha = 1;
    g.font = "600 11px sans-serif";
    for (const t of data[1].targets) {
      const cx = view.sx(t.pc[0]);
      const cy = view.sy(t.pc[1]);
      const on = t.id === currentId;
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const r = (k % 2 ? 0.45 : 1) * (on ? 11 : 7);
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        g[k ? "lineTo" : "moveTo"](cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      g.closePath();
      g.fillStyle = t.world === "moon" ? "#e8ecf5" : "#ff7a4d";
      g.strokeStyle = "#05070d";
      g.lineWidth = 1.5;
      g.stroke();
      g.fill();
      if (on) {
        g.fillStyle = "#fff";
        g.fillText(t.name, cx + 13, cy + 4);
      }
    }
  }, [data, view, size, type, currentId]);

  const nearest = (e: React.PointerEvent) => {
    if (!data || !view) return null;
    const r = canvas.current!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    let best: { d: number; kind: "t" | "e"; i: number } | null = null;
    data[1].targets.forEach((t, i) => {
      const d = Math.hypot(view.sx(t.pc[0]) - px, view.sy(t.pc[1]) - py) - 6;
      if (d < 12 && (!best || d < best.d)) best = { d, kind: "t", i };
    });
    if (!best) {
      data[0].data.forEach((p, i) => {
        if (type !== null && p[2] !== type) return;
        const d = Math.hypot(view.sx(p[0]) - px, view.sy(p[1]) - py);
        if (d < 10 && (!best || d < best.d)) best = { d, kind: "e", i };
      });
    }
    return best as { d: number; kind: "t" | "e"; i: number } | null;
  };

  return (
    <div>
      <p className="max-w-[66ch] text-sm text-muted-foreground">
        Every dot is a 28 km patch of Earth, placed by what was measured there (temperature, plants, ground freezing,
        thermal inertia, relief, Sun angle). Stars are Moon and Mars targets in the same chart. Click a dot to fly the
        map to that place, or a star to score Earth for it.
      </p>
      <div ref={box} className="relative mt-4 overflow-hidden rounded-2xl bg-black/30 ring-1 ring-white/10">
        <canvas
          ref={canvas}
          style={{ width: size.w, height: size.h }}
          className={cn("block", hover && "cursor-pointer")}
          aria-label="Scatter of Earth environment types with Moon and Mars targets"
          onPointerMove={(e) => {
            const n = nearest(e);
            if (!n || !data) return setHover(null);
            const r = canvas.current!.getBoundingClientRect();
            const label =
              n.kind === "t"
                ? data[1].targets[n.i].name
                : `${data[1].types[data[0].data[n.i][2]].name} · ${data[0].data[n.i][3].toFixed(1)}°, ${data[0].data[n.i][4].toFixed(1)}°`;
            setHover({ x: e.clientX - r.left, y: e.clientY - r.top, label });
          }}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const n = nearest(e as unknown as React.PointerEvent);
            if (!n || !data) return;
            if (n.kind === "t") onTarget(data[1].targets[n.i].id);
            else onEarth(data[0].data[n.i][3], data[0].data[n.i][4]);
          }}
        />
        {!data && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Loading the model output…
          </p>
        )}
        {hover && (
          <span
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[130%] rounded-md bg-black/80 px-2 py-1 text-xs whitespace-nowrap ring-1 ring-white/15"
            style={{ left: hover.x, top: hover.y }}
          >
            {hover.label}
          </span>
        )}
        <span className="pointer-events-none absolute start-3 bottom-2 text-[10px] text-muted-foreground">PC1 →</span>
        <span className="pointer-events-none absolute start-3 top-2 text-[10px] text-muted-foreground">↑ PC2</span>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Environment types">
        {data?.[1].types.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              aria-pressed={type === t.id}
              onClick={() => setType(type === t.id ? null : t.id)}
              title={t.blurb}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1 text-xs ring-1 transition-colors duration-150",
                type === t.id ? "bg-white/10 ring-white/30" : "ring-white/10 hover:bg-white/[0.05]",
              )}
            >
              <span className="size-2.5 rounded-full" style={{ background: t.color }} aria-hidden />
              {t.name}
              <span className="hud text-muted-foreground">{t.areaPct.toFixed(0)}%</span>
            </button>
          </li>
        ))}
        <li className="flex items-center gap-3 ps-2 text-xs text-muted-foreground">
          <span>
            ★ <span className="text-[#e8ecf5]">Moon</span>
          </span>
          <span>
            ★ <span className="text-[#ff7a4d]">Mars</span>
          </span>
        </li>
      </ul>
    </div>
  );
}
