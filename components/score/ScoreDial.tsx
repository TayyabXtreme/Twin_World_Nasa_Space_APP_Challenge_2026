"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";

/** Verdict bands for the educational score; colour is never the only signal (the word is always shown). */
export function verdict(score: number) {
  if (score >= 70) return { label: "Favourable", color: "var(--ok)" };
  if (score >= 50) return { label: "Workable with care", color: "var(--primary)" };
  return { label: "Challenging", color: "var(--warn)" };
}

const SWEEP = 270;
const START = 135;
const R = 92;

function polar(angleDeg: number, r: number) {
  const a = (angleDeg * Math.PI) / 180;
  // Rounded so server and client render identical attribute strings (no hydration mismatch from float noise).
  return { x: Math.round((120 + r * Math.cos(a)) * 100) / 100, y: Math.round((120 + r * Math.sin(a)) * 100) / 100 };
}
function arc(r: number) {
  const s = polar(START, r);
  const e = polar(START + SWEEP, r);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`;
}

/**
 * The score as an instrument: a 270° gauge with a tick ring. On mount the arc draws in and the number counts
 * up from zero; afterwards both glide to new values as weights change.
 */
export function ScoreDial({ score, caption }: { score: number; caption: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? score : 0);
  useEffect(() => {
    const c = animate(mv, score, { duration: reduce ? 0 : 1.1, ease: [0.23, 1, 0.32, 1] });
    return () => c.stop();
  }, [mv, score, reduce]);
  const text = useTransform(mv, (v) => Math.round(v).toString());
  const length = useTransform(mv, (v) => v / 100);
  const cap = useTransform(mv, (v) => {
    const p = polar(START + (SWEEP * v) / 100, R);
    return `translate(${p.x}px, ${p.y}px)`;
  });
  const v = verdict(score);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[17rem]">
      <svg viewBox="0 0 240 240" className="size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="dial-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--primary)" stopOpacity="0.55" />
            <stop offset="1" stopColor={v.color} />
          </linearGradient>
        </defs>
        {/* Slow outer ring: the instrument is live. */}
        <g className="score-ring-spin">
          <circle
            cx="120"
            cy="120"
            r="114"
            fill="none"
            stroke="oklch(1 0 0 / 0.1)"
            strokeWidth="1"
            strokeDasharray="2 7"
          />
        </g>
        {Array.from({ length: 55 }, (_, i) => {
          const angle = START + (SWEEP * i) / 54;
          const major = i % 9 === 0;
          const a = polar(angle, major ? 103 : 105);
          const b = polar(angle, 109);
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={major ? "oklch(1 0 0 / 0.45)" : "oklch(1 0 0 / 0.16)"}
              strokeWidth={major ? 1.5 : 1}
            />
          );
        })}
        <path d={arc(R)} fill="none" stroke="oklch(1 0 0 / 0.07)" strokeWidth="10" strokeLinecap="round" />
        <motion.path
          d={arc(R)}
          fill="none"
          stroke="url(#dial-grad)"
          strokeWidth="10"
          strokeLinecap="round"
          style={{ pathLength: length }}
        />
        <motion.g style={{ transform: cap }}>
          <circle r="9" fill={v.color} opacity="0.25" />
          <circle r="4.5" fill="white" />
        </motion.g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="flex items-baseline gap-1">
          <motion.span className="font-heading text-[4.25rem] leading-none font-semibold tracking-tight tabular-nums">
            {text}
          </motion.span>
          <span className="text-sm text-muted-foreground">/100</span>
        </span>
        <span className="mt-2 text-sm font-medium" style={{ color: v.color }}>
          {v.label}
        </span>
        <span className="mt-0.5 text-xs text-muted-foreground">{caption}</span>
      </div>
      <p className="sr-only" aria-live="polite">
        Score {score} out of 100, {v.label}.
      </p>
    </div>
  );
}
