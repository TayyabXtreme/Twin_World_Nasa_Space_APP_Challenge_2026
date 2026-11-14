"use client";

import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { Explainer } from "@/lib/rovi/types";
import { cn } from "@/lib/utils";

const KIND_RING: Record<Explainer["nodes"][number]["kind"], string> = {
  data: "ring-[oklch(0.71_0.15_250/0.6)] text-[oklch(0.85_0.09_250)]",
  process: "ring-[oklch(0.78_0.14_295/0.6)] text-[oklch(0.88_0.08_295)]",
  result: "ring-primary/60 text-primary",
  place: "ring-[oklch(0.82_0.14_75/0.6)] text-warn",
};

/**
 * A "learn it" card (after Archify's explainers): the answer first, then a small flow diagram and a stepper. Each
 * step lights the nodes it is about; tapping a node jumps to the first step that mentions it.
 */
export function ExplainerCard({ e }: { e: Explainer }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const step = e.steps[i];
  const lit = new Set(step?.nodes ?? []);
  const go = (n: number) => setI(Math.max(0, Math.min(e.steps.length - 1, n)));

  return (
    <section aria-label={e.title} className="rovi-msg w-[94%] overflow-hidden rounded-2xl bg-white/[0.035] ring-1 ring-white/10">
      <header className="flex items-start gap-2.5 border-b border-white/[0.07] px-3.5 py-3">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0">
          <p className="font-heading text-[14px] leading-snug font-semibold">{e.title}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/85">{e.answer}</p>
        </div>
      </header>

      {/* Flow diagram: nodes in reading order, arrows between linked neighbours. */}
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 px-3.5 pt-3" aria-label="Diagram">
        {e.nodes.map((n, k) => {
          const on = lit.has(n.id);
          const next = e.nodes[k + 1];
          const edge = next && e.edges.find((x) => x.from === n.id && x.to === next.id);
          return (
            <li key={n.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const first = e.steps.findIndex((s) => s.nodes.includes(n.id));
                  if (first >= 0) go(first);
                }}
                aria-pressed={on}
                className={cn(
                  "rounded-lg px-2 py-1 text-[11.5px] font-medium ring-1 transition-[background-color,opacity,transform] duration-200 ease-[var(--ease-out)]",
                  KIND_RING[n.kind],
                  on ? "scale-[1.04] bg-white/10 opacity-100" : "bg-transparent opacity-55 hover:opacity-90",
                )}
              >
                {n.label}
              </button>
              {next && (
                <span
                  className={cn("text-[11px] text-muted-foreground transition-opacity duration-200", on && lit.has(next.id) ? "opacity-100" : "opacity-50")}
                  title={edge?.label || undefined}
                  aria-hidden
                >
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {step && (
        <div className="px-3.5 pt-2.5 pb-3">
          <div className="relative min-h-[4.25rem]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={i}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -10 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              >
                <p className="text-[13px] font-semibold">
                  <span className="hud me-1.5 text-[11px] text-muted-foreground">{i + 1}/{e.steps.length}</span>
                  {step.title}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">{step.text}</p>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous step" className="rovi-tour-btn disabled:opacity-35">
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
            <div className="flex flex-1 justify-center gap-1" role="tablist" aria-label="Steps">
              {e.steps.map((s, k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={k === i}
                  aria-label={s.title}
                  onClick={() => go(k)}
                  className={cn("h-1.5 rounded-full transition-[width,background-color] duration-200", k === i ? "w-4 bg-primary" : "w-1.5 bg-white/25")}
                />
              ))}
            </div>
            <button type="button" onClick={() => go(i + 1)} disabled={i === e.steps.length - 1} className="rovi-tour-btn rovi-tour-next disabled:opacity-35">
              Next <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
