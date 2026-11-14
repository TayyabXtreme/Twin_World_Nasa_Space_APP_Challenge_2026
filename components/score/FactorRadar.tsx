"use client";

import { motion, useReducedMotion } from "motion/react";
import { FACTOR_INFO, type FactorId } from "@/lib/score";

const C = 130;
const RMAX = 92;

function point(i: number, n: number, r: number) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
}
const toPoints = (pts: (readonly [number, number])[]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/**
 * Factor values (0–1) on a radar. The polygon grows out of the centre when a site loads and morphs as the
 * site or weights change; the hovered factor's axis lights up in step with the list and the bar.
 */
export function FactorRadar({
  rows,
  colors,
  active,
  onActive,
}: {
  rows: { id: FactorId; value: number; weight: number }[];
  colors: Record<FactorId, string>;
  active: FactorId | null;
  onActive: (id: FactorId | null) => void;
}) {
  const reduce = useReducedMotion();
  const n = rows.length;
  const shape = toPoints(rows.map((r, i) => point(i, n, Math.max(0.04, r.value) * RMAX)));
  const centre = toPoints(rows.map(() => [C, C] as const));

  return (
    <svg viewBox="-55 -5 370 270" className="w-full max-w-[21rem] overflow-visible" role="img" aria-label="Radar chart of factor values">
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={toPoints(rows.map((_, i) => point(i, n, k * RMAX)))} fill="none" stroke="oklch(1 0 0 / 0.08)" />
      ))}
      {rows.map((r, i) => {
        const [x, y] = point(i, n, RMAX);
        const [lx, ly] = point(i, n, RMAX + 20);
        const on = active === r.id;
        return (
          <g key={r.id} onPointerEnter={() => onActive(r.id)} onPointerLeave={() => onActive(null)}>
            <line x1={C} y1={C} x2={x} y2={y} stroke={on ? colors[r.id] : "oklch(1 0 0 / 0.1)"} strokeWidth={on ? 2 : 1} />
            <text
              x={lx}
              y={ly}
              textAnchor={Math.abs(lx - C) < 8 ? "middle" : lx > C ? "start" : "end"}
              dominantBaseline="middle"
              className="text-[9.5px] transition-colors duration-150"
              fill={on ? "var(--foreground)" : "var(--muted-foreground)"}
            >
              {FACTOR_INFO[r.id].label}
            </text>
          </g>
        );
      })}
      <motion.polygon
        initial={reduce ? false : { points: centre }}
        animate={{ points: shape }}
        transition={{ duration: reduce ? 0 : 0.9, ease: [0.23, 1, 0.32, 1] }}
        fill="oklch(0.88 0.14 182 / 0.16)"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {rows.map((r, i) => {
        const [x, y] = point(i, n, Math.max(0.04, r.value) * RMAX);
        return (
          <motion.circle
            key={r.id}
            initial={reduce ? false : { cx: C, cy: C }}
            animate={{ cx: x, cy: y, r: active === r.id ? 5 : 3 }}
            transition={{ duration: reduce ? 0 : 0.9, ease: [0.23, 1, 0.32, 1] }}
            fill={colors[r.id]}
          />
        );
      })}
    </svg>
  );
}
