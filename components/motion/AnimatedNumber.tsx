"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";

/** A number that glides to its new value (strong ease-out, no motion when the user prefers less). */
export function AnimatedNumber({
  value,
  decimals = 0,
  format,
  className,
}: {
  value: number;
  decimals?: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const controls = animate(mv, value, { duration: reduce ? 0 : 0.45, ease: [0.23, 1, 0.32, 1] });
    return () => controls.stop();
  }, [mv, value, reduce]);
  const text = useTransform(mv, (v) => (format ? format(v) : v.toFixed(decimals)));
  return <motion.span className={className}>{text}</motion.span>;
}
